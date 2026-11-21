# Hospital IT Help Desk & Management System

All in-scope pages use the cookie-authenticated backend API by default. See [root setup, verification and production limitations](../LOCAL_VERIFICATION.md). The same-ticket lifecycle passed against both source and compiled frontend with a restricted MySQL runtime account. Demo passwords and development authentication are excluded from production builds, with build guards and artifact scans.

## Current account-profile migration

The current frontend follows [the account-profile API contract](../backend/docs/account-profiles.md), which supersedes older employee-directory and on-behalf instructions elsewhere in this historical README. Login accepts a username (including internal spaces) or an existing email. Users with a required password/profile setup are redirected to `/setup` before portal or notification queries; setup and `/profile` use cookie-authenticated `/api/auth` endpoints. Setup success revokes the session and requires a new login. Passwords and session tokens are not stored in browser storage.

API notification preview and live delivery use the same opt-in Web Audio patterns; playback waits for a user gesture and each incoming notification ID is played at most once per mounted browser session. Admin account, permission, settings and backup confirmations use Arabic keyboard-accessible dialogs instead of native browser prompts. The current Admin password is entered only in the verification dialog and sent to `/api/admin/reauthenticate`; `adminPassword` in account updates remains reserved for the new target Admin password. Frontend checks cover the service payloads and feed deduplication; a full live-browser pass still requires an available backend test environment.

Employee API tickets use the signed-in account and its saved department memberships. The employee form no longer selects a directory person or creates a ticket on behalf of another account. Engineer/Manager manual employee tickets search all employee login accounts through paginated `/api/user-options`, including accounts that have not completed setup; disabled accounts are visibly marked and cannot receive new tickets. A selected employee's active department is filled automatically when unique, otherwise an allowed department must be selected; a missing saved phone may be supplied as an optional ticket-only snapshot. Migration 019 makes new account-selected manual tickets visible in that employee's server-scoped dashboard, list and details while keeping the IT creator separate. Senior-management requests remain separate. Ticket identity/contact fields shown to IT are the server's creation-time snapshots, not current profile joins. Legacy asset custody still uses its historical directory identifiers; this frontend does not import or map roster data. The Admin users page supports account creation and one-button atomic edits to identity, contact/memberships, activity and role through a coded password-verification dialog, strong-password Admin promotion and operational temporary resets without exposing passwords. API authorization remains the server's responsibility.

واجهة عربية داخلية لمكتب دعم تكنولوجيا المعلومات. تدعم المصادقة الحقيقية عبر API؛ تبقى صفحات الأعمال التجريبية متاحة فقط في وضع التطوير الصريح إلى حين ترحيلها.

## التشغيل

يتطلب Node.js 20 أو أحدث.

```bash
npm install
npm run dev
```

ثم افتح العنوان الذي يعرضه Vite. فحوصات المشروع:

```bash
npm run lint
npm run verify:auth
npm run verify:tickets
npm run verify:admin
npm run verify:administration
npm run verify:notifications
npm run verify:assets
npm run verify:reports
npm run verify:e2e
npm run verify:theme
npm run build
npm run preview
```

## الصفحات والمسارات

- `/login` — تسجيل الدخول التجريبي
- `/employee` — بوابة الموظف المحمية تجريبيًا
- `/employee/new-ticket` — اختيار الموظف صراحةً من دليل قابل للبحث والتصفح، مع عرض قسمه تلقائيًا؛ تُرسل هوية سجل الدليل فقط ويحدد الخادم الاسم والقسم وملكية البلاغ

نموذج الموظف لا يطلب عنوانًا منفصلًا للمشكلة؛ يُنشأ عنوان موجز تلقائيًا من وصف المشكلة لإيفاء عقد API الحالي.

- `/technician` — بوابة مهندس تكنولوجيا المعلومات المحمية تجريبيًا
- `/technician/tickets` — جميع البلاغات للمهندس، مع عرض بلاغات الزملاء دون صلاحية تعديلها
- `/technician/tickets/:id` — تفاصيل البلاغ للعرض، وإجراءات المعالجة للمهندس المسند إليه فقط
- `/manager` — بوابة مدير تكنولوجيا المعلومات المحمية تجريبيًا
- `/manager/tickets` — إدارة جميع التذاكر والبحث وتصفية الحالة والترتيب والإسناد، دون فلتر إسناد منفصل
- `/manager` — لوحة المدير تعرض إجراء إسناد أو إعادة إسناد مباشرًا للتذاكر النشطة دون فتح صفحة التفاصيل
- `/manager/tickets/:id` — مراجعة التذكرة وإسنادها وتغيير أولويتها
- `/manager/fault-categories` — إدارة تصنيفات الأعطال الرئيسية والفرعية
- `/manager/departments` — إدارة أقسام المركز
- `/manager/technicians` — إدارة مهندسي تكنولوجيا المعلومات التجريبيين
- `/admin` — لوحة مستقلة لمسؤول النظام بإحصاءات الحسابات والأمان والمراقبة والنسخ الاحتياطية من `/api/admin`
- `/admin/users` — إنشاء الحسابات، البحث والتفعيل والتعطيل وتغيير الدور مباشرة بعد إعادة التحقق، وإعادة كلمة المرور وإلغاء الجلسات
- `/admin/roles` — مصفوفة الأدوار وصلاحيات الإدارة فقط؛ سياسات البلاغات والأصول للعرض لا للتعديل
- `/admin/audit` — سجل تدقيق للقراءة فقط، مع تصفية الدور والفاعل والوحدة والنتيجة والتاريخ
- `/admin/settings` — إعدادات النظام المرقمة النسخة؛ الشعار الحالي للعرض حتى تتوفر واجهة رفع آمنة
- `/admin/backups` و`/admin/monitoring` — حالة النسخ والمراقبة؛ الاستعادة عبر HTTP غير متاحة في الخلفية الحالية
- `/employee/notifications` — سجل إشعارات حساب الموظف
- `/technician/notifications` — سجل إشعارات حساب مهندس تكنولوجيا المعلومات
- `/manager/notifications` — سجل إشعارات حساب مدير تكنولوجيا المعلومات
- `/technician/manual-ticket` — تسجيل بلاغ يدوي لصالح موظف أو الإدارة العليا
- `/manager/manual-ticket` — تسجيل بلاغ يدوي لصالح موظف أو الإدارة العليا
- `/it/assets` — صفحة الأصول الرئيسية للمهندسين والمديرين: ست بطاقات محسوبة من الخادم، تليها مباشرة قائمة الأصول والبحث والتصفية والترقيم
- `/it/assets/types` — أنواع الأصول وسياسة الرقم المسلسل لكل نوع؛ للمهندس والمدير الصلاحيات نفسها
- `/it/assets/registry` — يعيد التوجيه إلى `/it/assets` مع الاحتفاظ بمعاملات البحث والتصفية
- `/it/assets/registry/new` و`/it/assets/registry/:id` و`/it/assets/registry/:id/edit` — الإضافة والتفاصيل وتعديل البيانات مع سجل الحركات والعهدة والحالة
- `/it/assets/groups` و`/it/assets/groups/:id` — مجموعات مرنة لأصول فردية أو سجلات كميات؛ لا يُخصم مكون المخزون المعلق حتى إسناد المجموعة
- `/it/assets/stock` — أصناف المخزون بالكميات والأرصدة والحركات
- `/it/assets/custody` — عرض مبسط للعهد والمجموعات؛ نقل العهدة من تفاصيل الأصل أو المجموعة
- `/it/assets/workstations` — محطات العمل وربط الأصول ونقلها
- `/it/assets/movements` — سجل الحركات والتسليم والإرجاع والنقل والحجز
- `/it/assets/replacement` — الاستبدال الذري بين أصلين من التصنيف نفسه
- `/it/assets/maintenance` — صيانة الأصول، مستقلة عن وحدة الصيانة اليدوية الملغاة
- `/it/assets/inventory` — الجرد التأسيسي والدوري والمراجعة والاعتماد
- `/it/assets/reports` و`/it/assets/administration` — تقارير الأصول والتصنيفات/المواقع للمهندس والمدير
- `/it/assets/legacy` — سجل الكميات السابق للتوافق مع السجلات والسحوبات الموجودة
- `/it/assets/new` — إضافة أصل تقني
- `/it/assets/:id` — تفاصيل الأصل والبلاغات المرتبطة وسجل التغييرات
- `/it/assets/:id/edit` — تعديل بيانات الأصل

The preferred asset screens use the cookie-authenticated `/api/asset-management/simple` contract in [backend/docs/assets-page-contract.md](../backend/docs/assets-page-contract.md). An asset record has a positive integer quantity (default 1); the six server dashboard counters sum units while list pagination counts records. Serial rules come from the selected asset type: REQUIRED serials use one unit, DISABLED serials permit batches, and OPTIONAL serials permit batches only without a serial. A quantity cannot change while the asset is assigned, grouped or under maintenance. Each group component consumes one unit; pending stock definitions do not deduct until group assignment, and a return specifies NEW, USED or OUT_OF_SERVICE with optional per-component overrides. Custody, location, condition and maintenance apply to every unit in a batch. Writes carry `clientRequestId`, edits carry `expectedVersion`, and the UI reports success only after the server confirms it. The existing comprehensive asset endpoints and routes remain available directly for compatibility/history, but are not part of the simple navigation. The old `/api/assets` quantity registry remains at `/it/assets/legacy`; no data is silently converted. Browser end-to-end checks against a live development API remain necessary. Run `npm run lint` and `npm run build` from this directory.

- `/manager/reports` — ملخص أعداد البلاغات، أكثر أنواع الأعطال تسجيلًا، والموظفين الأكثر تسجيلًا للبلاغات، مع تصفية التاريخ والتصدير

يوفر الرأس العام جرس إشعارات بعدد غير المقروء، وقائمة مختصرة، وتحديد إشعار واحد أو الكل كمقروء، وفتح البلاغ المرتبط. تنشأ الإشعارات من أحداث البلاغات المركزية وتُصفّى برقم الحساب التجريبي، مع مزامنة علامات التبويب في المتصفح نفسه عبر `BroadcastChannel`. أصوات البلاغ الجديد والإسناد مختلفة، ولا تعمل تلقائيًا إلا بعد تفاعل المستخدم وفق قيود المتصفح. هذه محاكاة محلية فقط وليست خدمة إشعارات متعددة الأجهزة.

تسجل وحدة الأصول التقنية الأجهزة والملحقات المستخدمة أو الاحتياطية في سجلات ذات كميات صحيحة موجبة. تدعم الوحدة الإضافة والتعديل والعرض والأرشفة الآمنة والبحث والتصفية والإحصاءات، مع حفظ سجل التغييرات وملاحظات الصيانة. أُلغي حقلا الفئة وتقييم الحالة؛ السجلات القديمة التي لا تحتوي كمية تُعرض كوحدة واحدة، وتُحسب تقارير الحالة التشغيلية حسب عدد الوحدات مع إظهار عدد السجلات منفصلًا.

يمكن للمهندس المسند إليه بلاغ قيد المعالجة البحث عن أصل تقني يعمل وسحب وحدة واحدة للبلاغ. تُسجّل الحالة «تم السحب» واسم المهندس ورقم البلاغ في سجل الأصل ونشاط البلاغ. إذا كان الأصل مجموعة من عدة وحدات، تنقص الكمية المتاحة وحدة واحدة ويُنشأ سجل منفصل للوحدة المسحوبة؛ وإذا كانت وحدة واحدة تتغير حالة السجل نفسه. لا يمكن سحب أكثر من وحدة واحدة للبلاغ في الواجهة الحالية، ويجب فرض العملية ذريًا من الخادم عند الانتقال للإنتاج.

يمكن تصدير السجلات الظاهرة بحسب فلاتر صفحة الأصول إلى ملف Excel بصيغة `.xlsx`، بعناوين أعمدة عربية واتجاه ورقة من اليمين إلى اليسار. يتضمن الملف الكميات والحالة التشغيلية وبيانات الأصل، ولا يتضمن حقلي الفئة أو التقييم الملغيين.

تعرض صفحة التقارير الإدارية أعداد البلاغات الإجمالية والمحلولة وغير المحلولة والتي أُعيد فتحها، إضافة إلى ترتيب أكثر أنواع الأعطال تسجيلًا وترتيب الموظفين الأكثر تسجيلًا للبلاغات. يجمع ترتيب الأعطال حسب التصنيف والتصنيف الفرعي المحفوظين في البلاغ، ويجمع ترتيب الموظفين حسب رقم الموظف إن توفر وإلا حسب الاسم والقسم المدخلين يدويًا، مع استبعاد بلاغات الإدارة العليا من ترتيب الموظفين. تُحسب المحلولة من الحالات «تم الحل» و«مغلقة»، وتُحسب غير المحلولة من بقية الحالات؛ أما المعاد فتحها فتشمل أي بلاغ سُجلت له إعادة فتح ولو حُلّ لاحقًا. يمكن تحديد نطاق بتاريخ إنشاء البلاغ وتصدير الملخص وكل ترتيب بصيغة CSV. لا تعرض الصفحة أداء المهندسين أو متوسط زمن الحل أو إحصاءات الأصول؛ تظل إحصاءات الأصول ضمن صفحة سجل الأصول.

يستطيع المهندس أو المدير تسجيل بلاغ يدوي ورد هاتفيًا أو بصورة مباشرة، مع تحديد ما إذا كان لصالح موظف أو الإدارة العليا. يحتفظ البلاغ بهوية عضو فريق تكنولوجيا المعلومات الذي سجله دون ربط ملكيته بحساب موظف غير صحيح.
في نموذج المدير للبلاغ اليدوي، إسناد البلاغ إلى مهندس نشط اختياري حتى لو كان غير متاح مؤقتًا؛ يُنشأ البلاغ دون إسناد افتراضيًا، أو تُسجّل عملية الإسناد بالطريقة المعتادة عند اختيار مهندس. لا يتضمن نموذج المهندس خيار الإسناد.

أُلغيت وحدة «الصيانة اليدوية» المستقلة: لا يوجد لها مسار أو نموذج أو تقارير. لا تُحذف سجلاتها التجريبية القديمة من تخزين المتصفح تلقائيًا. يظل «البلاغ اليدوي» ميزة مختلفة ومتاحة لفريق تكنولوجيا المعلومات، وتظل حقول صيانة الأصل ضمن سجل الأصل التقني.

بوابة الموظف تضم لوحة التحكم، وإنشاء الطلب، وصفحة «طلباتي»، وصفحة تفاصيل محمية حسب ملكية الحساب. تظل النافذة المنبثقة وسيلة المتابعة السريعة، بينما تعرض صفحة التفاصيل السجل الكامل والتعليقات وتأكيد الحل وإعادة الفتح. لا توجد تقييمات للمهندسين وفق متطلبات المشروع الثابتة.

في نماذج إنشاء البلاغ، يبقى حقل «التصنيف الفرعي» معطّلًا وبمظهر باهت حتى يُختار التصنيف الرئيسي، وتُمسح قيمته عند تغيير التصنيف.

لوحة الموظف في `/employee` تعرض إحصاءات وطلبات الحساب التجريبي المسجل فقط، باستخدام `reporterAccountId` وليس اسم مقدم الطلب. إنشاء الطلب يدعم طلبًا شخصيًا افتراضيًا أو طلبًا بالنيابة عن موظف آخر. لا توجد تقييمات للمهندسين.

يعرض كل حساب تجريبي التنقل الخاص بدوره فقط. الحماية والصلاحيات محاكاة للواجهة وليست بديلًا عن التحقق من جهة الخادم.

تعتمد صفحة الدخول على بريد إلكتروني وكلمة مرور تجريبيين، ولا تعرض قائمة الحسابات أو تملأ بيانات الدخول تلقائيًا. تشمل الهوية التجريبية ثلاثة مديرين (سميرة، نهال، نسمة)، وثلاثة مهندسين (محمد، أحمد، عبد الرحمن)، وموظفتين (سمر عراقي، ولاء). عند حدوث مشكلة، تطلب الصفحة التواصل مع قسم تكنولوجيا المعلومات أو عبر واتساب على الرقم `01018335538`، مع شعار واتساب محلي في `public/brand/whatsapp.svg`. جميع عناوين `@demo.example` خيالية وغير قابلة لاستقبال البريد.

التخزين المحلي مخصص للعرض على متصفح واحد: يمكن للمستخدم تعديل محتواه أو حذفه، ولا يقدم تزامنًا موثوقًا بين الأجهزة أو معالجة تعارضات التعديل أو نسخًا احتياطية. يجب نقل المصادقة والصلاحيات وملكية البلاغات وحفظ البيانات إلى خدمات خادم قبل الاستخدام الحقيقي. كلمات المرور التجريبية موجودة في الشيفرة الأمامية، وليست أسرارًا أو وسيلة أمان، لكنها لا تُحفظ ضمن الجلسة أو التخزين المحلي.

بوابة المهندس تعرض مؤشرات الإسناد الخاصة بتذاكره، كما تعرض أحدث البلاغات من جميع الأقسام في قسم منفصل. تعرض صفحة جميع التذاكر بلاغات الفريق مع زر «إسناد لنفسي» للبلاغ الجديد غير المسند فقط؛ لا يمكن الاستحواذ على بلاغ مسند لزميل. يقتصر بدء العمل والتعليق والملاحظات والحل وسحب الأصول على المهندس المسند إليه البلاغ. عند تسجيل الحل يُنشر حدث مركزي وتصبح خطوة تأكيد الحل متاحة للموظف.

يمكن للمهندس إيقاف توفره مؤقتًا من لوحة التحكم ثم إعادة تفعيله بنفسه. لا يعطّل ذلك حسابه أو تذاكره الحالية، ويمنع إسناد بلاغ غير مسند إلى نفسه، لكن يمكن للمدير إسناد بلاغ جديد إليه رغم عدم توفره المؤقت. تظهر حالة التوفر للمدير في نافذة الإسناد، بينما يبقى إسناد البلاغات إلى المهندسين غير النشطين ممنوعًا.

تعرض صفحة تذاكر المهندس أيضًا البلاغات الجديدة غير المسندة. يمكن للمهندس النشط والمتاح إسناد أحدها إلى نفسه؛ تُسجَّل العملية كإسناد ذاتي في سجل النشاط ويصدر حدث الإسناد المعتاد. لا يمكنه الاستحواذ على بلاغ مسند لغيره. رؤية التفاصيل لا تمنح صلاحية إجراء تغييرات. المحاكاة المحلية لا تمنع تعارض المطالبة المتزامنة بين عدة متصفحات؛ يفرض الخادم الحقيقي صلاحيات التغيير وذرية المطالبة.

بوابة المدير تعرض مؤشرات كل التذاكر، والتذاكر غير المسندة، مهام المهندسين، وتوزيع الحالات. يمكن للمدير البحث في جميع التذاكر، وفتح التفاصيل، والإسناد أو إعادة الإسناد من نافذة واحدة. تمنع الخدمة إسناد التذاكر إلى مهندس غير نشط، وتسجل العملية في سجل النشاط وتنشر حدثًا مركزيًا يظهر أثره مباشرة في بوابة المهندس. لا يستخدم النظام أولوية للبلاغات ولا يصدر إشعارات مرتبطة بالأولوية.

يسجل كل إسناد أو إعادة إسناد رقم حساب المدير واسمه وقت تنفيذ العملية. يرى المهندس اسم آخر مدير أصدر الإسناد في لوحة التحكم وقائمة التذاكر وصفحة التفاصيل، بينما يحتفظ سجل النشاط بأسماء المديرين السابقين عند إعادة الإسناد. تتوفر حسابات مديرين تجريبية إضافية لاختبار هذا المسار.

تعرض لوحتا المدير والمهندس قسمًا للمشكلات المتكررة. يجمع النظام التذاكر التي تحمل تصنيف العطل نفسه داخل القسم نفسه، ويعرض عدد مرات التكرار والتذاكر المرتبطة. تعرض لوحة المهندس الأنماط الموجودة داخل التذاكر المسندة إليه فقط.

تضم وحدة الإدارة مستودعات تكنولوجيا المعلوماتتصنيفات الأعطال والأقسام والمهندتكنولوجيا المعلوماتيفات والأقستكنولوجيا المعلوماتيًا في نموذج إنشاء الطلب، وتظهر حالة المهندسين في نافذة الإسناد. لا توفر الوحدة حذفًا نهائيًا للسجلات، لذلك تحتفظ التذاكر التاريخية بمسميات التصنيف والقسم والمهندس حتى بعد تعديل السجل المرجعي أو تعطيله. أسماء المستخدمين للعرض التجريبي فقط ولا توجد إدارة كلمات مرور حقيقية.

عند إضافة مستخدم إلى فريق تقنية المعلومات، يقتصر اختيار الدور على «مهندس تقنية المعلومات» أو «مدير تقنية المعلومات». تظهر حسابات المهندسين فقط داخل خيارات إسناد التذاكر، ولا يمكن إسناد تذكرة إلى حساب مدير.

يدعم النظام الوضعين النهاري والليلي، ويحفظ اختيار المستخدم محليًا. تستخدم الواجهة خط Tajawal للنصوص وخط Cairo للعناوين.

يبدأ العرض بالوضع النهاري في أول زيارة. تبديل الوضع الليلي متاح من صفحة الدخول والرأس العام، ويستمر بعد تحديث الصفحة. فحص `verify:theme` يتحقق من التبديل والحفظ، بينما يتحقق `verify:e2e` من دورة البلاغ المدعومة بين الموظف والمدير والمهندس، والإشعارات والأصول واتساق التقارير. خطوات تقييم خدمة المهندس غير متاحة وفق قرار المشروع الحالي.

الشعار الرسمي المستخدم في صفحة الدخول والرأس العام محفوظ في `public/brand/fayoum-oncology-center-logo.jpg`.

## المعمارية

- `src/app`: إعداد التطبيق وتعريف المسارات المركزي.
- `src/components`: عناصر العرض المشتركة الأساسية، ومنها مكونات التذاكر.
- `src/features`: ملف صفحة مستقل لكل شاشة، مقسم حسب دور المستخدم.
- `src/layouts`: قوالب لوحات التحكم المتجاوبة.
- `src/services`: عقود الخدمات، mock data، عازل localStorage، وevent bus.
- `src/styles`: design tokens وخطوط Cairo وTajawal وأنماط RTL وقواعد الصفحات العامة. تعديل قواعد الصفحات هنا ينعكس على جميع الشاشات.

يجب ألا تصل الصفحات إلى `localStorage` مباشرة. تتعامل الصفحات مع خدمة المجال، والخدمة تستخدم عازل التخزين؛ وبذلك يمكن استبدال الخدمات لاحقًا بعملاء API من دون إعادة كتابة الواجهة.

## ملاحظات أمان

- المصادقة المحلية الحقيقية تستخدم API وجلسة خادم؛ لا يوجد تكامل Active Directory.
- لا تُدخل بيانات اعتماد Windows أو بيانات طبية حساسة.
- الحسابات التجريبية خيالية ومخصصة للعرض فقط، ولا تُعرض بياناتها في صفحة الدخول. لا تُحفظ كلمات المرور في الجلسة أو `localStorage`.
- الخادم يفرض الأدوار والملكية ونطاق الإسناد؛ حراسة المسارات وحدها ليست تفويضًا.
- يستخدم النظام شعار مركز أورام الفيوم المرفق بالمشروع، مع الحفاظ على أبعاده الأصلية.

## Engineer backend integration

Engineer API routes are connected in API mode; see [ENGINEER_API.md](ENGINEER_API.md) for contracts, refresh behavior and live-database verification. Manager pages are now connected; see MANAGER_API.md. Shared inventory and notifications are now connected; see ASSETS_NOTIFICATIONS_API.md.

## Manager backend integration

See [MANAGER_API.md](MANAGER_API.md) for connected manager workflows, optional manual-ticket assignment, server reports/CSV export, and live-database tests.

## Shared inventory and persisted notifications

API mode now connects inventory, XLSX export, notification bell/history and live updates. See [ASSETS_NOTIFICATIONS_API.md](ASSETS_NOTIFICATIONS_API.md) for access rules, sound behavior, proxy setup and live-database verification.

## Complete local lifecycle and production credential checks

Run `npm run verify:full-flow-browser` against the clean isolated audit database before building. After `npm run build`, run `npm run verify:production`. To test the compiled frontend, set `HELPDESK_BROWSER_BUILD=1` for the full-flow script, then remove it. Exact PowerShell commands and current verification evidence are in [LOCAL_VERIFICATION.md](../LOCAL_VERIFICATION.md). The test rejects a nonempty audit baseline, uses the restricted runtime account for APIs, and removes its fictional fixtures. Local success is not a deployment-readiness claim.
