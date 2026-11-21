import { configureApiProxy } from "./apiProxy.mjs";
import { createMySqlNotificationRepository } from "../../backend/src/repositories/mysqlNotificationRepository.js";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID, randomBytes } from "node:crypto";
import { createServer } from "vite";
import { createRequire } from "node:module";
const { parse } = createRequire(
  new URL("../../backend/package.json", import.meta.url),
)("dotenv");
import { createPool } from "../../backend/src/db/pool.js";
import { createMySqlUserRepository } from "../../backend/src/repositories/mysqlUserRepository.js";
import { createMySqlSessionRepository } from "../../backend/src/repositories/mysqlSessionRepository.js";
import { createLocalAccountService } from "../../backend/test/support/accounts.js";
import { createLocalPasswordProvider } from "../../backend/src/auth/localPasswordProvider.js";
import { createAuthService } from "../../backend/src/auth/authService.js";
import { createMySqlTicketRepository } from "../../backend/src/repositories/mysqlTicketRepository.js";
import { createMySqlDashboardRepository } from "../../backend/src/repositories/mysqlDashboardRepository.js";
import { createMySqlReferenceRepository } from "../../backend/src/repositories/mysqlReferenceRepository.js";
import { createMySqlTicketWorkflowRepository } from "../../backend/src/repositories/mysqlTicketWorkflowRepository.js";
import { createNotificationService } from "../../backend/src/notifications/service.js";
import { ticketInput } from "../../backend/src/tickets/validation.js";
import { createMySqlItUserRepository } from "../../backend/src/repositories/mysqlItUserRepository.js";
import { createMySqlAssetRepository } from "../../backend/src/repositories/mysqlAssetRepository.js";
import { createMySqlEmployeeDirectoryRepository } from "../../backend/src/repositories/mysqlEmployeeDirectoryRepository.js";
import { assetInput } from "../../backend/src/assets/validation.js";
import { createMySqlReportRepository } from "../../backend/src/repositories/mysqlReportRepository.js";
import { createApp } from "../../backend/src/app.js";
import { createProfileRepository } from '../../backend/src/auth/profiles.js'

const accounts = [],
  pending = new Map(),
  departments = [],
  categories = [],
  subcategories = [],
  stock = [];
let ticketRepository,
  workflow,
  dropNext = false;
const password = "Fictional-" + randomBytes(24).toString("hex");
let pool,
  api,
  vite,
  chrome,
  profile,
  sequence = 0,
  buffer = "";
let apiFailure = false,
  failLogin = false,
  failLogout = false,
  meDelay = 0;
try {
  const e = parse(
    await readFile(new URL("../../backend/.env.fresh.test", import.meta.url)),
  );
  assert.match(e.DB_NAME, /^hospital_it_helpdesk_test_fresh_[a-f0-9]{12}$/);
  assert.notEqual(e.DB_USER, "root");
  pool = createPool({
    host: e.DB_HOST,
    port: Number(e.DB_PORT),
    database: e.DB_NAME,
    user: e.DB_USER,
    password: e.DB_PASSWORD,
  });
  const users = createMySqlUserRepository(pool),
    provision = createLocalAccountService(users);
  for (const role of ["employee", "technician", "manager", "engineerB"])
    accounts.push({
      ...(await provision.create({
        email: "frontend-" + role + "-" + randomUUID() + "@demo.example",
        fullName: "Fictional " + role,
        role: role === "engineerB" ? "technician" : role,
        password,
      })),
      fixtureKey: role,
    });
  const managementRepositories = {
    itUsers: createMySqlItUserRepository(pool),
    departments: createMySqlReferenceRepository(pool, "departments"),
    categories: createMySqlReferenceRepository(pool, "categories"),
    subcategories: createMySqlReferenceRepository(pool, "subcategories"),
    employees: createMySqlEmployeeDirectoryRepository(pool),
  };
  for (let i = 0; i < 2; i++) {
    const suffix = randomUUID();
    departments.push(
      await managementRepositories.departments.save({
        name: "قسم خيالي " + suffix,
        isActive: true,
      }),
    );
    categories.push(
      await managementRepositories.categories.save({
        name: "عطل خيالي " + suffix,
        isActive: true,
      }),
    );
    subcategories.push(
      await managementRepositories.subcategories.save({
        name: "فرعي خيالي " + suffix,
        categoryId: categories[i].id,
        isActive: true,
      }),
    );
  }
  const directoryEmployee = await managementRepositories.employees.create(
    {
      fullName: "موظف مدير خيالي " + randomUUID(),
      departmentId: departments[0].id,
    },
    accounts.find((a) => a.fixtureKey === "manager"),
  );
  const notifications = createNotificationService();
  ticketRepository = createMySqlTicketRepository(pool, { notifications });
  workflow = createMySqlTicketWorkflowRepository(pool, { notifications });
  const assetRepository = createMySqlAssetRepository(pool);
  const assetActor = accounts.find((a) => a.fixtureKey === "manager");
  for (const [kind, quantity] of [
    ["BATCH", 3],
    ["SINGLE", 1],
  ])
    stock.push(
      await assetRepository.create(
        assetInput({
          assetId: "ENGINEER-" + randomUUID().slice(0, 12) + "-" + kind,
          name: "أصل خيالي " + kind,
          quantity,
          manufacturer: "خيالي",
          model: "اختبار",
          holdingType: "it_storage",
          location: "مخزن خيالي",
          operationalStatus: "working",
          conditionDescription: "بيانات خيالية",
        }),
        assetActor,
      ),
    );
  const auth = createAuthService({
    provider: await createLocalPasswordProvider(users),
    sessions: createMySqlSessionRepository(pool),
  });
  let origin;
  const app = createApp({ profileRepository: createProfileRepository(pool), 
    notificationRepository: createMySqlNotificationRepository(pool),
    authService: {
      async login(input) {
        if (failLogin) {
          const error = Error("Private");
          error.code = "ER_LOCK_WAIT_TIMEOUT";
          throw error;
        }
        return auth.login(input);
      },
      async getUser(token, options) {
        if (meDelay)
          await new Promise((resolve) => setTimeout(resolve, meDelay));
        if (apiFailure) throw Error("Private");
        return auth.getUser(token, options);
      },
      async logout(token) {
        if (failLogout) throw Error("Private");
        return auth.logout(token);
      },
    },
    reportRepository: createMySqlReportRepository(pool),
    assetRepository,
    managementRepositories,
    ticketRepository: {
      ...ticketRepository,
      async create(...args) {
        const result = await ticketRepository.create(...args);
        if (dropNext) {
          dropNext = false;
          throw Error("Fictional lost response");
        }
        return result;
      },
    },
    ticketWorkflowRepository: workflow,
    dashboardRepository: createMySqlDashboardRepository(pool),
    config: {
      nodeEnv: "test",
      get appOrigin() {
        return origin;
      },
    },
  });
  api = app.listen(0, "127.0.0.1");
  await once(api, "listening");
  vite = await createServer({
    server: {
      host: "127.0.0.1",
      port: 0,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:" + api.address().port,
          changeOrigin: false,
          configure: configureApiProxy,
        },
      },
    },
  });
  await vite.listen();
  origin = "http://127.0.0.1:" + vite.httpServer.address().port;
  profile = await mkdtemp(join(tmpdir(), "helpdesk-browser-"));
  chrome = spawn(
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-pipe",
      "--user-data-dir=" + profile,
    ],
    {
      windowsHide: true,
      stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"],
    },
  );
  chrome.stdio[4].on("data", (chunk) => {
    buffer += chunk.toString();
    let index;
    while ((index = buffer.indexOf("\0")) !== -1) {
      const value = JSON.parse(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
      const callback = pending.get(value.id);
      if (callback) {
        pending.delete(value.id);
        value.error
          ? callback.reject(Error(value.error.message))
          : callback.resolve(value.result);
      }
    }
  });
  const command = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(Error("Browser command timed out: " + method));
      }, 15000);
      pending.set(id, {
        resolve: (v) => {
          clearTimeout(timeout);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timeout);
          reject(e);
        },
      });
      chrome.stdio[3].write(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }) + "\0",
      );
    });
  const { targetId } = await command("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await command("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const evaluate = async (expression) => {
    const response = await command(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      sessionId,
    );
    if (response.exceptionDetails) throw Error("Browser expression failed");
    return response.result.value;
  };
  const waitFor = async (expression) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    throw Error("Browser condition timed out: " + expression);
  };
  const navigate = async (path) => {
    await command("Page.navigate", { url: origin + path }, sessionId);
    await waitFor('!!document.querySelector("#root")');
  };
  const click = async (text) =>
    evaluate(
      'Array.from(document.querySelectorAll("button")).find(x => x.textContent.trim() === ' +
        JSON.stringify(text) +
        ")?.click()",
    );
  await command(
    "Emulation.setDeviceMetricsOverride",
    { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
    sessionId,
  );

  const employee = accounts.find((a) => a.fixtureKey === "employee"),
    engineer = accounts.find((a) => a.fixtureKey === "technician"),
    other = accounts.find((a) => a.fixtureKey === "engineerB"),
    manager = accounts.find((a) => a.fixtureKey === "manager");
  const fill = async (values) =>
    evaluate(
      "(()=>{for(const[selector,value]of Object.entries(" +
        JSON.stringify(values) +
        ')){const el=document.querySelector(selector);if(!el)throw Error("Missing input");const proto=el.tagName==="SELECT"?HTMLSelectElement.prototype:el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));}})()',
    );
  const submit = async (selector) =>
    evaluate(
      "document.querySelector(" +
        JSON.stringify(selector) +
        ").requestSubmit()",
    );
  const login = async (account) => {
    await navigate("/login");
    await waitFor('!!document.querySelector("input[name=username]")');
    await fill({
      "input[name=username]": account.email,
      "input[name=password]": password,
    });
    await submit("form");
    await waitFor(
      'location.pathname === "/' +
        account.role +
        '" && !!document.querySelector("header nav[aria-label=\\"التنقل الرئيسي\\"]")',
    );
  };
  const make = async (title, assignee) => {
    const item = (
      await ticketRepository.create(
        ticketInput(
          {
            reporterName: "طالب دعم خيالي",
            departmentId: departments[0].id,
            categoryId: categories[0].id,
            title,
            description: "تفاصيل خيالية محفوظة على الخادم",
          },
          employee,
        ),
        employee,
      )
    ).item;
    if (assignee)
      await workflow.execute(
        item.id,
        "assign",
        { technicianId: assignee.id, expectedVersion: 0 },
        manager,
      );
    return item;
  };

  const main = await make("تذكرة مدير خيالية للاختبار");
  await managementRepositories.itUsers.setOwnAvailability(engineer.id, false);
  const employeeSession = await auth.login({ email: employee.email, password }),
    engineerSession = await auth.login({ email: engineer.email, password }),
    managerSession = await auth.login({ email: manager.email, password });
  const raw = async (path, session, method = "GET", body) =>
    fetch("http://127.0.0.1:" + api.address().port + "/api" + path, {
      method,
      headers: {
        Origin: origin,
        Cookie: "it-helpdesk-session=" + session.token,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  for (const session of [employeeSession, engineerSession]) {
    for (const path of ["/reports", "/reports/export.csv"])
      assert.equal((await raw(path, session)).status, 403);
    for (const [path, body] of [
      ["/departments", { name: "forged" }],
      ["/fault-categories", { name: "forged" }],
      [
        "/fault-subcategories",
        { name: "forged", categoryId: categories[0].id },
      ],
      [
        "/it-users",
        { username: "forged", fullName: "forged", role: "manager" },
      ],
      [
        "/tickets/" + main.id + "/assignment",
        { technicianId: engineer.id, expectedVersion: 0 },
      ],
    ])
      assert.equal((await raw(path, session, "POST", body)).status, 403);
  }
  await login(engineer);
  await navigate("/manager");
  await waitFor('location.pathname==="/unauthorized"');
  await click("تسجيل الخروج");
  await waitFor('location.pathname==="/login"');
  await login(manager);
  await waitFor(
    'document.body.textContent.includes("تذكرة مدير خيالية للاختبار") && document.body.textContent.includes("غير متاح مؤقتًا")',
  );
  assert.equal(
    await evaluate("document.documentElement.scrollWidth<=innerWidth"),
    true,
  );
  await click("إسناد لمهندس");
  await waitFor(
    '!!document.querySelector("[role=dialog] input[name=technician]")',
  );
  await evaluate(
    'document.querySelector("[role=dialog] input[name=technician][value=' +
      JSON.stringify(engineer.id) +
      ']").click()',
  );
  await click("حفظ الإسناد");
  await waitFor(
    '!document.querySelector("[role=dialog]") && document.body.textContent.includes("Fictional technician")',
  );
  assert.equal(
    (await ticketRepository.getById(main.id, manager)).assignedByManagerId,
    manager.id,
  );
  await navigate("/manager/tickets");
  await waitFor('!!document.querySelector("select[name=status]")');
  assert.equal(
    await evaluate('!!document.querySelector("select[name=assignment]")'),
    false,
  );
  await fill({ "input[name=search]": "تذكرة مدير خيالية للاختبار" });
  await waitFor('document.querySelectorAll("article").length===1');
  assert.equal(
    await evaluate(
      'document.querySelector("article button")?.textContent.includes("إعادة الإسناد")',
    ),
    true,
  );
  await navigate("/manager/tickets/" + main.id);
  await waitFor(
    'document.querySelector("select[name=technicianId]")?.options.length>1',
  );
  assert.equal(
    await evaluate(
      'Array.from(document.querySelector("select[name=technicianId]").options).some(x=>x.value===' +
        JSON.stringify(engineer.id) +
        ' && x.textContent.includes("غير متاح مؤقتًا") && !x.disabled)',
    ),
    true,
  );
  await fill({ "select[name=technicianId]": engineer.id });
  await click("حفظ الإسناد");
  await waitFor('document.body.textContent.includes("تم تحديث الإسناد.")');
  let assigned = await ticketRepository.getById(main.id, manager);
  assert.equal(assigned.assignedTechnicianId, engineer.id);
  assert.equal(assigned.assignedByManagerId, manager.id);
  await navigate("/manager/tickets/" + main.id);
  await waitFor(
    'document.body.textContent.includes("Fictional technician") && document.body.textContent.includes("Fictional manager")',
  );
  // Conflict reload: another manager action advances the same ticket version.
  const before = await ticketRepository.getById(main.id, manager);
  await workflow.execute(
    main.id,
    "assign",
    { technicianId: other.id, expectedVersion: before.version },
    manager,
  );
  await fill({ "select[name=technicianId]": engineer.id });
  await click("حفظ الإسناد");
  await waitFor('!!document.querySelector("[role=alert]")');
  assert.equal(
    (await ticketRepository.getById(main.id, manager)).assignedTechnicianId,
    other.id,
  );
  await waitFor('document.body.textContent.includes("Fictional engineerB")');
  await fill({ "select[name=technicianId]": engineer.id });
  await click("حفظ الإسناد");
  await waitFor('document.body.textContent.includes("تم تحديث الإسناد.")');
  console.log(
    "PASS manager authorization, unavailable engineer assignment, reassignment conflict and persistence",
  );

  // Management forms use real APIs. Only fictional fixtures are created.
  await navigate("/manager/departments");
  await waitFor('document.body.textContent.includes("إدارة الأقسام")');
  await click("إضافة قسم");
  await fill({ "input[name=name]": "قسم مدير خيالي " + main.id });
  await click("حفظ القسم");
  await waitFor(
    '!document.querySelector("input[name=name]") && document.body.textContent.includes("قسم مدير خيالي")',
  );
  const department = (
    await managementRepositories.departments.list({
      search: "قسم مدير خيالي " + main.id,
    })
  )[0];
  departments.push(department);
  await fill({ "input[name=search]": department.name });
  await waitFor('document.querySelectorAll("article").length===1');
  await click("تعديل");
  await fill({ "input[name=name]": department.name + " معدل" });
  await click("حفظ القسم");
  await waitFor(
    '!document.querySelector("input[name=name]") && document.body.textContent.includes("معدل")',
  );
  await click("تعطيل");
  await waitFor('document.body.textContent.includes("معطل")');
  assert.equal(
    (await managementRepositories.departments.getById(department.id)).isActive,
    false,
  );
  await click("تفعيل");
  await waitFor('document.body.textContent.includes("نشط")');

  await navigate("/manager/categories");
  await waitFor('document.body.textContent.includes("تصنيفات الأعطال")');
  await click("إضافة تصنيف رئيسي");
  await fill({ "input[name=name]": "تصنيف مدير خيالي " + main.id });
  await click("حفظ التصنيف");
  await waitFor(
    '!document.querySelector("input[name=name]") && document.body.textContent.includes("تصنيف مدير خيالي")',
  );
  const category = (
    await managementRepositories.categories.list({
      search: "تصنيف مدير خيالي " + main.id,
    })
  )[0];
  categories.push(category);
  await fill({ "input[name=search]": category.name });
  await waitFor('document.querySelectorAll("section.content-card").length===1');
  await click("إضافة تصنيف فرعي");
  await fill({ "input[name=name]": "فرعي مدير خيالي " + main.id });
  await click("حفظ التصنيف");
  await waitFor(
    '!document.querySelector("input[name=name]") && document.body.textContent.includes("فرعي مدير خيالي")',
  );
  const sub = (
    await managementRepositories.subcategories.list({ categoryId: category.id })
  )[0];
  subcategories.push(sub);
  await click("تعديل الفرعي");
  await fill({ "input[name=name]": sub.name + " معدل" });
  await click("حفظ التصنيف");
  await waitFor(
    '!document.querySelector("input[name=name]") && document.body.textContent.includes("معدل")',
  );
  await click("تعطيل الفرعي");
  await waitFor('document.body.textContent.includes("تفعيل الفرعي")');
  assert.equal(
    (await managementRepositories.subcategories.getById(sub.id)).isActive,
    false,
  );
  await click("تفعيل الفرعي");
  await waitFor('document.body.textContent.includes("تعطيل الفرعي")');

  await navigate("/manager/engineers");
  await waitFor('!!document.querySelector("select[name=roleFilter]")');
  await click("إضافة مستخدم");
  assert.equal(
    await evaluate(
      'Array.from(document.querySelector("select[name=role]").options).map(x=>x.value).join(",")',
    ),
    "technician,manager",
  );
  assert.equal(
    await evaluate(
      '!!document.querySelector("input[type=password],input[name=phone],input[name=extension]")',
    ),
    false,
  );
  const username = "fictional-" + randomUUID().slice(0, 16);
  await fill({
    "input[name=username]": username,
    "input[name=fullName]": "مستخدم مدير خيالي",
  });
  await click("حفظ المستخدم");
  await waitFor(
    '!document.querySelector("input[name=username]") && document.body.textContent.includes("مستخدم مدير خيالي")',
  );
  const created = (
    await managementRepositories.itUsers.list(false, { search: username })
  )[0];
  accounts.push(created);
  const [[credentials]] = await pool.execute(
    "SELECT password_hash FROM users WHERE id=?",
    [created.id],
  );
  assert.equal(credentials.password_hash, null);
  await fill({ "input[name=search]": username });
  await waitFor('document.querySelectorAll("article").length===1');
  await click("تعديل");
  await fill({
    "input[name=fullName]": "اسم مستخدم معدل",
    "select[name=role]": "manager",
  });
  await click("حفظ المستخدم");
  await waitFor(
    '!document.querySelector("input[name=username]") && document.body.textContent.includes("اسم مستخدم معدل")',
  );
  await click("تعطيل");
  await waitFor('document.body.textContent.includes("حساب معطل")');
  assert.equal(
    (await managementRepositories.itUsers.getById(created.id)).role,
    "manager",
  );
  console.log(
    "PASS manager departments, categories/subcategories and IT-user CRUD without credentials",
  );

  const manual = async (title, assign, type = "employee") => {
    await navigate("/manager/manual-ticket");
    await waitFor('!!document.querySelector("#manual-employee-search")');
    assert.equal(
      await evaluate('!!document.querySelector("input[name=title]")'),
      false,
    );
    if (type === "top_management") {
      await evaluate(
        'document.querySelector("input[value=top_management]").click()',
      );
      await waitFor(
        '!!document.querySelector("input[name=managementPosition]")',
      );
      assert.equal(
        await evaluate('!!document.querySelector("select[name=department]")'),
        false,
      );
      await fill({
        "input[name=reporterName]": "طالب دعم مدير خيالي",
        "input[name=managementPosition]": "مكتب خيالي",
      });
    } else {
      await fill({ "#manual-employee-search": directoryEmployee.fullName });
      await waitFor(
        'document.querySelector("[role=listbox] button")?.textContent.includes(' +
          JSON.stringify(directoryEmployee.fullName) +
          ")",
      );
      await evaluate('document.querySelector("[role=listbox] button").click()');
      assert.equal(
        await evaluate('document.querySelector("input[readonly]").value'),
        departments[0].name,
      );
    }
    await fill({
      "select[name=category]": categories[0].id,
      "textarea[name=description]": title,
    });
    await waitFor(
      '!document.querySelector("select[name=subcategory]").disabled',
    );
    await fill({ "select[name=subcategory]": subcategories[0].id });
    if (assign)
      await fill({ "select[name=assignedTechnicianId]": engineer.id });
    else
      assert.equal(
        await evaluate(
          'document.querySelector("select[name=assignedTechnicianId]").value',
        ),
        "",
      );
    await click("إنشاء البلاغ اليدوي");
    await waitFor(
      'document.body.textContent.includes("تم إنشاء البلاغ اليدوي بنجاح")',
    );
    return (
      await ticketRepository.list(
        {
          search: title,
          status: "all",
          sort: "newest",
          assignment: "all",
          page: 1,
          pageSize: 10,
        },
        manager,
      )
    ).items[0];
  };
  const unassignedManual = await manual(
    "بلاغ مدير بدون إسناد " + main.id,
    false,
  );
  assert.equal(unassignedManual.status, "new");
  assert.equal(unassignedManual.assignedTechnicianId, null);
  const assignedManual = await manual(
    "بلاغ مدير مع إسناد " + main.id,
    true,
    "top_management",
  );
  const manualDetail = await ticketRepository.getById(
    assignedManual.id,
    manager,
  );
  assert.equal(manualDetail.assignedTechnicianId, engineer.id);
  assert.equal(manualDetail.assignedByManagerId, manager.id);
  assert.equal(manualDetail.reporterAccountId, null);
  assert.equal(manualDetail.requesterType, "top_management");
  // Historical labels remain unchanged after management edits.
  await managementRepositories.departments.save(
    { name: "قسم تاريخي معدل" },
    departments[0].id,
    manager,
  );
  assert.equal(
    (await ticketRepository.getById(main.id, manager)).department,
    departments[0].name,
  );

  await navigate("/manager/reports");
  await waitFor('document.querySelectorAll(".metric-card").length===4');
  const summary = (await (await raw("/reports", managerSession)).json())
    .tickets;
  assert.deepEqual(
    await evaluate(
      'Array.from(document.querySelectorAll(".metric-card strong")).map(x=>Number(x.textContent))',
    ),
    [summary.total, summary.solved, summary.unsolved, summary.reopened],
  );
  await fill({
    "input[name=dateFrom]": "2099-01-01",
    "input[name=dateTo]": "2099-01-02",
  });
  await waitFor(
    'Array.from(document.querySelectorAll(".metric-card strong")).every(x=>x.textContent==="0")',
  );
  await fill({ "input[name=dateFrom]": "2099-01-03" });
  await waitFor(
    'document.body.textContent.includes("يجب أن يكون تاريخ البداية")',
  );
  assert.equal(
    await evaluate(
      'Array.from(document.querySelectorAll("button")).find(x=>x.textContent.includes("CSV")).disabled',
    ),
    true,
  );
  await click("إعادة ضبط");
  await waitFor('document.querySelectorAll(".metric-card").length===4');
  await evaluate(
    'window.reportExports=[];const original=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).includes("/reports/export.csv"))window.reportExports.push(String(args[0]));return original(...args)}',
  );
  await click("تصدير التقرير CSV");
  await waitFor("window.reportExports.length===1");
  const exported = await raw(
    "/reports/export.csv?dateFrom=2099-01-01&dateTo=2099-01-02",
    managerSession,
  );
  assert.match(exported.headers.get("Content-Type"), /text\/csv/);
  assert.match(await exported.text(), /0/);
  await mkdir("artifacts.local", { recursive: true });
  assert.equal(
    await evaluate("document.documentElement.scrollWidth<=innerWidth"),
    true,
  );
  await writeFile(
    "artifacts.local/manager-light-mobile.png",
    Buffer.from(
      (
        await command(
          "Page.captureScreenshot",
          { format: "png", captureBeyondViewport: false },
          sessionId,
        )
      ).data,
      "base64",
    ),
  );
  await click("الوضع الليلي");
  await waitFor('document.documentElement.classList.contains("dark")');
  await command(
    "Emulation.setDeviceMetricsOverride",
    { width: 768, height: 900, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  await navigate("/manager");
  await waitFor(
    'document.querySelectorAll(".metric-card").length>0 && document.body.textContent.includes("مهام المهندسين")',
  );
  assert.equal(
    await evaluate("document.documentElement.scrollWidth<=innerWidth"),
    true,
  );
  await writeFile(
    "artifacts.local/manager-dark-tablet.png",
    Buffer.from(
      (
        await command(
          "Page.captureScreenshot",
          { format: "png", captureBeyondViewport: false },
          sessionId,
        )
      ).data,
      "base64",
    ),
  );
  await command(
    "Emulation.setDeviceMetricsOverride",
    { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  await navigate("/manager/tickets");
  await waitFor('!!document.querySelector("select[name=status]")');
  assert.equal(
    await evaluate("document.documentElement.scrollWidth<=innerWidth"),
    true,
  );
  console.log(
    "PASS manager manual-ticket optional assignment, reports/server CSV, historical labels, RTL and themes",
  );
  await click("تسجيل الخروج");
  await waitFor('location.pathname==="/login"');
  await login(engineer);
  await navigate("/technician/tickets");
  await waitFor(
    'document.body.textContent.includes("تذكرة مدير خيالية للاختبار") && document.body.textContent.includes("بلاغ مدير مع إسناد")',
  );
  await navigate("/technician/tickets/" + main.id);
  await waitFor('document.body.textContent.includes("Fictional manager")');
  assert.equal(
    await evaluate('document.documentElement.classList.contains("dark")'),
    true,
  );
  console.log(
    "PASS manager assignments appear in engineer queue/details after refresh",
  );
  await command("Browser.close").catch(() => {});
} finally {
  chrome?.kill();
  await vite?.close();
  if (api) await new Promise((resolve) => api.close(resolve));
  if (pool) {
    try {
      const assetIds = new Set();
      for (const account of accounts) {
        const [rows] = await pool.execute(
          "SELECT DISTINCT asset_id FROM asset_history WHERE actor_account_id=?",
          [account.id],
        );
        for (const row of rows) assetIds.add(row.asset_id);
        await pool.execute(
          "DELETE FROM asset_withdrawals WHERE engineer_id=?",
          [account.id],
        );
      }
      for (const account of accounts)
        await pool.execute(
          "DELETE FROM tickets WHERE created_by_account_id = ?",
          [account.id],
        );
      for (const id of assetIds)
        await pool.execute("DELETE FROM assets WHERE asset_id=?", [id]);
      for (const [table, rows] of [
        ["fault_subcategories", subcategories],
        ["fault_categories", categories],
        ["departments", departments],
        ["users", accounts],
      ])
        for (const row of rows)
          await pool.execute("DELETE FROM " + table + " WHERE id = ?", [
            row.id,
          ]);
    } finally {
      await pool.end();
    }
  }
  if (profile && profile.startsWith(join(tmpdir(), "helpdesk-browser-")))
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    }).catch(() => {});
}
