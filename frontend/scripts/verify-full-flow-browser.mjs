import { configureApiProxy } from "./apiProxy.mjs";
import { createMySqlNotificationRepository } from "../../backend/src/repositories/mysqlNotificationRepository.js";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID, randomBytes } from "node:crypto";
import { createServer, preview } from "vite";
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
  runtime,
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
  const applicationTables = [
    "users",
    "auth_sessions",
    "departments",
    "fault_categories",
    "fault_subcategories",
    "tickets",
    "ticket_history",
    "assets",
    "asset_history",
    "asset_withdrawals",
    "notification_accounts",
    "notification_events",
    "notifications",
  ];
  for (const table of applicationTables) {
    const [[row]] = await pool.query("SELECT COUNT(*) n FROM " + table);
    assert.equal(
      row.n,
      0,
      "Fresh-test database must have no application records before this flow",
    );
  }
  const eRuntime = parse(
    await readFile(
      new URL("../../backend/.env.fresh.runtime", import.meta.url),
    ),
  );
  assert.equal(eRuntime.DB_NAME, e.DB_NAME);
  assert.notEqual(eRuntime.DB_USER, e.DB_USER);
  assert.notEqual(eRuntime.DB_USER, "root");
  runtime = createPool({
    host: eRuntime.DB_HOST,
    port: Number(eRuntime.DB_PORT),
    database: eRuntime.DB_NAME,
    user: eRuntime.DB_USER,
    password: eRuntime.DB_PASSWORD,
  });
  const users = createMySqlUserRepository(runtime),
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
    itUsers: createMySqlItUserRepository(runtime),
    departments: createMySqlReferenceRepository(runtime, "departments"),
    categories: createMySqlReferenceRepository(runtime, "categories"),
    subcategories: createMySqlReferenceRepository(runtime, "subcategories"),
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
  const notifications = createNotificationService();
  ticketRepository = createMySqlTicketRepository(runtime, { notifications });
  workflow = createMySqlTicketWorkflowRepository(runtime, { notifications });
  const assetRepository = createMySqlAssetRepository(runtime);
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
    sessions: createMySqlSessionRepository(runtime),
  });
  let origin;
  const app = createApp({ profileRepository: createProfileRepository(pool), 
    notificationRepository: createMySqlNotificationRepository(runtime),
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
    reportRepository: createMySqlReportRepository(runtime),
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
    dashboardRepository: createMySqlDashboardRepository(runtime),
    config: {
      nodeEnv: "test",
      get appOrigin() {
        return origin;
      },
    },
  });
  api = app.listen(0, "127.0.0.1");
  await once(api, "listening");
  const built = process.env.HELPDESK_BROWSER_BUILD === "1";
  const browserServer = {
    host: "127.0.0.1",
    port: 0,
    strictPort: false,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:" + api.address().port,
        changeOrigin: false,
        configure: configureApiProxy,
      },
    },
  };
  vite = built
    ? await preview({ preview: browserServer })
    : await createServer({ server: browserServer });
  if (!built) await vite.listen();
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
        '" && document.body.textContent.includes("تم تسجيل الدخول")',
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

  const other = accounts.find((account) => account.fixtureKey === "engineerB");
  const otherEmployee = {
    ...(await provision.create({
      email: "flow-other-" + randomUUID() + "@demo.example",
      fullName: "Fictional other employee",
      role: "employee",
      password,
    })),
    fixtureKey: "employeeB",
  };
  accounts.push(otherEmployee);
  const rawSessions = {};
  for (const account of [employee, engineer, other, manager, otherEmployee])
    rawSessions[account.id] = await auth.login({
      email: account.email,
      password,
    });
  const raw = async (
    path,
    account,
    method = "GET",
    body,
    originValue = origin,
  ) =>
    fetch("http://127.0.0.1:" + api.address().port + "/api" + path, {
      method,
      headers: {
        ...(originValue ? { Origin: originValue } : {}),
        Cookie: "it-helpdesk-session=" + rawSessions[account.id].token,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const signOut = async () => {
    await click("تسجيل الخروج");
    await waitFor('location.pathname==="/login"');
  };
  const screenshot = async (name) => {
    assert.equal(
      await evaluate(
        'document.documentElement.dir==="rtl" && document.documentElement.lang==="ar"',
      ),
      true,
    );
    assert.equal(
      await evaluate("document.documentElement.scrollWidth<=innerWidth"),
      true,
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    await writeFile(
      "artifacts.local/full-flow-" + name + ".png",
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
  };
  await mkdir("artifacts.local", { recursive: true });
  await command("Page.enable", {}, sessionId);
  await login(employee);
  await navigate("/employee/new-ticket");
  await waitFor('!!document.querySelector("input[name=reporterName]")');
  assert.equal(
    await evaluate('document.querySelector("input[name=reporterName]").value'),
    "",
  );
  assert.equal(
    await evaluate('document.querySelector("select[name=department]").value'),
    "",
  );
  assert.equal(
    await evaluate(
      'document.querySelector("input[name=reportFor]:checked").value',
    ),
    "self",
  );
  await submit("form");
  await waitFor('!!document.querySelector("[role=alert]")');
  const title = "تذكرة دورة كاملة خيالية " + randomUUID().slice(0, 8);
  await fill({
    "input[name=reporterName]": "اسم خيالي يدوي مختلف عن الحساب",
    "select[name=department]": departments[0].id,
    "input[name=title]": title,
    "select[name=category]": categories[0].id,
    "textarea[name=description]": "تفاصيل اختبار خيالية دون بيانات حقيقية",
  });
  await fill({ "select[name=subcategory]": subcategories[0].id });
  dropNext = true;
  await submit("form");
  await waitFor(
    '!!document.querySelector("[role=alert]") && !document.querySelector("button[type=submit]").disabled',
  );
  await submit("form");
  await waitFor(
    'location.pathname==="/employee" && document.body.textContent.includes(' +
      JSON.stringify(title) +
      ")",
  );
  const [rows] = await pool.execute(
    "SELECT * FROM tickets WHERE created_by_account_id=? AND title=?",
    [employee.id, title],
  );
  assert.equal(rows.length, 1);
  const ticket = rows[0];
  assert.equal(ticket.reporter_account_id, employee.id);
  assert.equal(ticket.created_for, "self");
  assert.notEqual(ticket.reporter_name, employee.fullName);
  const [[events]] = await pool.execute(
    "SELECT COUNT(*) n FROM notification_events WHERE ticket_id=? AND type='new_ticket'",
    [ticket.id],
  );
  assert.equal(events.n, 1);
  const invalidBody = {
    reporterName: "خيالي",
    departmentId: departments[0].id,
    categoryId: categories[0].id,
    subcategoryId: subcategories[1].id,
    title: "رفض التصنيف",
    description: "خيالي",
  };
  assert.equal(
    (await raw("/tickets", employee, "POST", invalidBody)).status,
    400,
  );
  assert.equal(
    (
      await raw("/tickets", employee, "POST", {
        ...invalidBody,
        subcategoryId: subcategories[0].id,
        reporterAccountId: otherEmployee.id,
      })
    ).status,
    400,
  );
  assert.equal((await raw("/tickets/" + ticket.id, otherEmployee)).status, 404);
  assert.equal(
    (
      await raw("/tickets/" + ticket.id + "/comments", otherEmployee, "POST", {
        text: "مرفوض",
      })
    ).status,
    404,
  );
  assert.equal((await raw("/reports", employee)).status, 403);
  assert.equal((await raw("/assets", employee)).status, 403);
  await navigate("/employee");
  await waitFor(
    "document.body.textContent.includes(" + JSON.stringify(title) + ")",
  );
  await screenshot("employee-light-mobile");
  await signOut();
  console.log(
    "PASS full flow: employee UI login/create, lost-response duplicate prevention, manual identity, validation and ownership",
  );

  await login(manager);
  await navigate("/manager/notifications");
  await waitFor(
    "document.body.textContent.includes(" + JSON.stringify(title) + ")",
  );
  assert.ok(
    await evaluate(
      'Number(document.querySelector("[data-unread-count]").dataset.unreadCount)>0',
    ),
  );
  await click("فتح التذكرة");
  await waitFor(
    'location.pathname==="/manager/tickets/' +
      ticket.id +
      '" && document.querySelector("select[name=technicianId]")?.options.length>1',
  );
  await managementRepositories.itUsers.setOwnAvailability(engineer.id, false);
  await click("تحديث التذكرة");
  await waitFor(
    'Array.from(document.querySelector("select[name=technicianId]").options).some(x=>x.value===' +
      JSON.stringify(engineer.id) +
      ' && x.textContent.includes("غير متاح مؤقتًا") && !x.disabled)',
  );
  await fill({ "select[name=technicianId]": engineer.id });
  await click("حفظ الإسناد");
  await waitFor('document.body.textContent.includes("تم تحديث الإسناد.")');
  const assigned = await ticketRepository.getById(ticket.id, manager);
  assert.equal(assigned.assignedByManagerId, manager.id);
  assert.equal(assigned.assignedTechnicianId, engineer.id);
  assert.equal(
    (
      await raw("/tickets/" + ticket.id + "/assignment", employee, "POST", {
        technicianId: engineer.id,
        expectedVersion: assigned.version,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await raw("/tickets/" + ticket.id + "/assignment", manager, "POST", {
        technicianId: other.id,
        expectedVersion: 0,
      })
    ).status,
    409,
  );
  await click("الوضع الليلي");
  await waitFor('document.documentElement.classList.contains("dark")');
  await command(
    "Emulation.setDeviceMetricsOverride",
    { width: 768, height: 900, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  await screenshot("manager-dark-tablet");
  await signOut();
  console.log(
    "PASS full flow: manager notification to details, unavailable-engineer assignment, version conflicts and role controls",
  );

  await login(engineer);
  await navigate("/technician/notifications");
  await waitFor('document.body.textContent.includes("تم إسناد بلاغ إليك")');
  await evaluate(
    'Array.from(document.querySelectorAll("[data-notification-id]")).find(x=>x.textContent.includes("تم إسناد بلاغ إليك")).querySelector("button").click()',
  );
  await waitFor(
    'location.pathname==="/technician/tickets/' +
      ticket.id +
      '" && document.body.textContent.includes("Fictional manager")',
  );
  assert.equal((await raw("/tickets/" + ticket.id, other)).status, 404);
  assert.equal(
    (
      await raw("/it-users", engineer, "POST", {
        username: "forged",
        fullName: "مرفوض",
        role: "manager",
      })
    ).status,
    403,
  );
  await click("بدء العمل");
  await waitFor('!!document.querySelector("[data-ticket-status=in_progress]")');
  await fill({ "textarea[name=pendingReason]": "انتظار قطعة خيالية" });
  await submit("form:has(textarea[name=pendingReason])");
  await waitFor('!!document.querySelector("[data-ticket-status=pending]")');
  await navigate("/technician/tickets/" + ticket.id);
  await waitFor('document.body.textContent.includes("انتظار قطعة خيالية")');
  await click("استئناف العمل");
  await waitFor('!!document.querySelector("[data-ticket-status=in_progress]")');
  for (const [visibility, text] of [
    ["public", "ملاحظة عامة للدورة الكاملة"],
    ["internal", "ملاحظة داخلية للدورة الكاملة"],
  ]) {
    await fill({
      "select[name=noteVisibility]": visibility,
      "textarea[name=noteText]": text,
    });
    await submit("form:has(textarea[name=noteText])");
    await waitFor(
      'document.querySelector("textarea[name=noteText]").value==="" && document.body.textContent.includes(' +
        JSON.stringify(text) +
        ")",
    );
  }
  const publicView = await raw("/tickets/" + ticket.id, employee).then(
    (response) => response.json(),
  );
  assert.equal(
    JSON.stringify(publicView).includes("ملاحظة داخلية للدورة الكاملة"),
    false,
  );
  assert.ok(JSON.stringify(publicView).includes("ملاحظة عامة للدورة الكاملة"));
  const [batch] = stock;
  await fill({ "input[name=assetSearch]": batch.assetId });
  await waitFor(
    'document.querySelector("select[name=assetId]")?.options.length===2',
  );
  await fill({ "select[name=assetId]": batch.assetId });
  await submit("form:has(select[name=assetId])");
  await waitFor(
    'document.body.textContent.includes("سحبه المهندس: Fictional technician") && !document.querySelector("select[name=assetId]")',
  );
  const withdrawal = (await ticketRepository.getById(ticket.id, engineer))
    .relatedAssetId;
  assert.equal(
    (await assetRepository.getById(batch.assetId, manager)).quantity,
    2,
  );
  assert.equal(
    (await assetRepository.getById(withdrawal, manager)).quantity,
    1,
  );
  assert.equal(
    (
      await raw("/assets/" + batch.assetId + "/withdraw", engineer, "POST", {
        ticketId: ticket.id,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await raw("/assets/" + batch.assetId + "/withdraw", manager, "POST", {
        ticketId: ticket.id,
      })
    ).status,
    403,
  );
  assert.equal(
    await evaluate(
      'Array.from(document.querySelectorAll("form")).find(x=>x.querySelector("textarea[name=solutionDescription]")).querySelector("button").disabled',
    ),
    true,
  );
  await fill({ "textarea[name=solutionDescription]": "حل خيالي أول موثق" });
  await submit("form:has(textarea[name=solutionDescription])");
  await waitFor('!!document.querySelector("[data-ticket-status=closed]")');
  assert.equal(
    (
      await raw("/tickets/" + ticket.id + "/status", engineer, "POST", {
        status: "resolved",
        solutionDescription: "إعادة طلب",
        expectedVersion: 0,
      })
    ).status,
    409,
  );
  await navigate("/technician/tickets/" + ticket.id);
  await waitFor(
    'document.body.textContent.includes("حل خيالي أول موثق") && document.body.textContent.includes("سحبه المهندس: Fictional technician")',
  );
  await screenshot("engineer-dark-tablet");
  await signOut();
  console.log(
    "PASS full flow: engineer assignment notification, notes/privacy, pending/resume, transactional batch withdrawal and resolution",
  );

  await login(employee);
  await navigate("/employee/notifications");
  await waitFor('document.body.textContent.includes("تم حل البلاغ")');
  await click("فتح التذكرة");
  await waitFor(
    'location.pathname==="/employee/tickets/' +
      ticket.id +
      '" && document.body.textContent.includes("حل خيالي أول موثق")',
  );
  assert.equal(
    await evaluate(
      'document.body.textContent.includes("ملاحظة داخلية للدورة الكاملة")',
    ),
    false,
  );
  await fill({ "form textarea": "تعليق موظف خيالي على الحل" });
  await submit("form");
  await waitFor(
    'document.body.textContent.includes("تعليق موظف خيالي على الحل") && document.querySelector("form textarea").value===""',
  );
  await click("نعم، تم حل المشكلة");
  await waitFor('!!document.querySelector("[data-ticket-status=closed]")');
  await click("إعادة فتح الطلب");
  await fill({
    'textarea[placeholder="أضف توضيحًا يساعد المهندس على استكمال المعالجة"]':
      "عاد العطل في الاختبار الخيالي",
  });
  await click("إعادة فتح الطلب");
  await waitFor('!!document.querySelector("[data-ticket-status=reopened]")');
  assert.equal((await raw("/tickets/" + ticket.id, otherEmployee)).status, 404);
  await signOut();
  await login(engineer);
  await navigate("/technician/notifications");
  await waitFor('document.body.textContent.includes("أُعيد فتح البلاغ")');
  await navigate("/technician/tickets/" + ticket.id);
  await waitFor(
    '!!document.querySelector("textarea[name=solutionDescription]")',
  );
  await fill({
    "textarea[name=solutionDescription]": "حل خيالي نهائي بعد إعادة الفتح",
  });
  await submit("form:has(textarea[name=solutionDescription])");
  await waitFor('!!document.querySelector("[data-ticket-status=closed]")');
  await signOut();
  await login(employee);
  await navigate("/employee/tickets/" + ticket.id);
  await waitFor(
    'document.body.textContent.includes("حل خيالي نهائي بعد إعادة الفتح")',
  );
  await click("نعم، تم حل المشكلة");
  await waitFor('!!document.querySelector("[data-ticket-status=closed]")');
  await navigate("/employee/tickets/" + ticket.id);
  await waitFor('!!document.querySelector("[data-ticket-status=closed]")');
  assert.equal(
    await evaluate(
      'document.body.textContent.includes("ملاحظة داخلية للدورة الكاملة")',
    ),
    false,
  );
  await signOut();
  console.log(
    "PASS full flow: employee resolution notification, comments, confirmation, reopening, second solution and final confirmation",
  );

  await login(manager);
  await navigate("/manager/reports");
  await waitFor('document.querySelectorAll(".metric-card").length===4');
  const report = await raw("/reports", manager).then((response) =>
    response.json(),
  );
  assert.deepEqual(report.tickets, {
    total: 1,
    solved: 1,
    unsolved: 0,
    reopened: 1,
  });
  assert.deepEqual(
    await evaluate(
      'Array.from(document.querySelectorAll(".metric-card strong")).map(x=>Number(x.textContent))',
    ),
    [1, 1, 0, 1],
  );
  await click("تصدير التقرير CSV");
  const csv = await raw("/reports/export.csv", manager);
  assert.match(csv.headers.get("Content-Type"), /text\/csv/);
  assert.match(await csv.text(), /اسم خيالي يدوي مختلف عن الحساب/);
  await navigate("/it/assets");
  await waitFor('!!document.querySelector("input[name=search]")');
  await fill({ "input[name=search]": withdrawal });
  await waitFor('document.querySelectorAll("article.content-card").length===1');
  await click("تصدير Excel");
  const exported = await raw(
    "/assets/export.xlsx?search=" + withdrawal,
    manager,
  );
  const zip = createRequire(
    new URL("../../backend/package.json", import.meta.url),
  )("fflate").unzipSync(new Uint8Array(await exported.arrayBuffer()));
  const sheet = new TextDecoder().decode(zip["xl/worksheets/sheet1.xml"]);
  assert.match(sheet, /rightToLeft="1"/);
  assert.ok(sheet.includes(withdrawal));
  assert.ok(sheet.includes("Fictional technician"));
  assert.equal((await raw("/reports/export.csv", engineer)).status, 403);
  assert.equal((await raw("/assets/export.xlsx", employee)).status, 403);
  assert.equal(
    (
      await raw(
        "/tickets",
        employee,
        "POST",
        invalidBody,
        "https://untrusted.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (await raw("/tickets", employee, "POST", invalidBody, null)).status,
    403,
  );
  const final = await ticketRepository.getById(ticket.id, manager);
  assert.equal(
    final.history.filter(
      (event) => event.status === "resolved" && event.type === "resolution",
    ).length,
    2,
  );
  assert.equal(
    final.history.filter((event) => event.type === "reopened").length,
    1,
  );
  const [[stored]] = await pool.execute(
    "SELECT password_hash FROM users WHERE id=?",
    [employee.id],
  );
  assert.match(stored.password_hash, /^\$argon2id\$/);
  assert.notEqual(stored.password_hash, password);
  assert.equal(
    await evaluate('document.cookie.includes("it-helpdesk-session")'),
    false,
  );
  assert.equal(
    await evaluate(
      "Object.values(localStorage).some(value=>value.includes(" +
        JSON.stringify(ticket.id) +
        "))",
    ),
    false,
  );
  await command(
    "Emulation.setDeviceMetricsOverride",
    { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  await click("الوضع النهاري");
  await waitFor('!document.documentElement.classList.contains("dark")');
  await screenshot("manager-export-light-desktop");
  await navigate("/manager/reports");
  await waitFor('document.querySelectorAll(".metric-card").length===4');
  apiFailure = true;
  await click("تحديث التقرير / إعادة المحاولة");
  await waitFor('!!document.querySelector("[role=alert]")');
  apiFailure = false;
  await click("تحديث التقرير ");
  await waitFor('document.querySelectorAll(".metric-card").length===4');
  await signOut();
  const privateTicket = await make("تذكرة صلاحيات خيالية مستقلة", other);
  assert.equal(
    (await raw("/tickets/" + privateTicket.id, engineer)).status,
    200,
  );
  await writeFile(
    "artifacts.local/full-flow-result.local",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        database: e.DB_NAME,
        runtimeAccount: eRuntime.DB_USER,
        mode: "api",
        frontend: built ? "production-build" : "development-server",
        flow: "passed",
        employeeTicketId: ticket.id,
        report: report.tickets,
        baseline: "all application tables empty",
        productionReady: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS full flow: reports/counts/CSV/XLSX, immutable history, Argon2id, cookie/storage protection, origin checks, refresh, RTL/themes and recoverable errors",
  );
  await command("Browser.close").catch(() => {});
} finally {
  chrome?.kill();
  if (vite) {
    if (vite.close) await vite.close();
    else await new Promise((resolve) => vite.httpServer.close(resolve));
  }
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
      await runtime?.end();
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
