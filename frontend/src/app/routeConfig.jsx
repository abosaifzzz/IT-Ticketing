export const portalRoutes = [
  {
    role: 'admin', basePath: '/admin', label: 'إدارة النظام', shortLabel: 'مسؤول النظام', description: 'الحسابات والأمان والمراقبة فقط', pages: [
      { path: 'users', label: 'حسابات المستخدمين' },
      { path: 'roles', label: 'الأدوار والصلاحيات' },
      { path: 'audit', label: 'سجل التدقيق' },
      { path: 'settings', label: 'إعدادات النظام' },
      { path: 'backups', label: 'النسخ الاحتياطية' },
      { path: 'monitoring', label: 'مراقبة النظام' },
    ]
  },
  {
    role: 'employee', basePath: '/employee', label: 'بوابة الموظف', shortLabel: 'موظف', description: 'أنشئ طلبات الدعم وتابع حالتها بسهولة', pages: [
      { path: 'new-ticket', label: 'إنشاء طلب', description: 'تسجيل طلب شخصي أو بالنيابة عن موظف آخر' },
      { path: 'tickets', label: 'طلباتي', description: 'البحث في جميع الطلبات ومتابعة حالتها' },
    ]
  },
  {
    role: 'technician', basePath: '/technician', label: 'بوابة مهندس تكنولوجيا المعلومات', shortLabel: 'مهندس', description: 'إدارة المهام الهندسية والأصول المسندة', pages: [
      { path: 'tickets', label: 'جميع التذاكر', description: 'عرض جميع البلاغات ومتابعة التذاكر المسندة إليك' },
      { path: 'manual-ticket', label: 'بلاغ يدوي', description: 'تسجيل بلاغ وارد من موظف أو الإدارة العليا' },
      { path: '/it/employees', label: 'دليل الموظفين', description: 'إضافة الموظفين والبحث في بياناتهم' },
      { path: '/it/assets', label: 'الأصول التقنية', description: 'إدارة الأجهزة والمعدات المستخدمة والاحتياطية وحالتها الفنية' },
    ]
  },
  {
    role: 'manager', basePath: '/manager', label: 'بوابة مدير تكنولوجيا المعلومات', shortLabel: 'مدير', description: 'الإشراف على أداء الدعم وموارد القسم', pages: [
      { path: 'tickets', label: 'جميع التذاكر', description: 'مراجعة جميع تذاكر الدعم' },
      { path: 'manual-ticket', label: 'بلاغ يدوي', description: 'تسجيل بلاغ وارد من موظف أو الإدارة العليا' },
      { path: '/it/employees', label: 'دليل الموظفين', description: 'إضافة الموظفين والبحث في بياناتهم' },
      { path: 'technicians', label: 'إدارة المهندسين', description: 'إدارة مهندسي فريق تكنولوجيا المعلومات' },
      { path: 'fault-categories', label: 'تصنيفات الأعطال', description: 'إدارة أنواع وتصنيفات الأعطال' },
      { path: 'departments', label: 'إدارة الأقسام', description: 'إدارة أقسام المركز المستخدمة في النظام' },
      { path: 'notifications', label: 'الإشعارات', description: 'إدارة تنبيهات وتحديثات النظام' },
      { path: '/it/assets', label: 'الأصول التقنية', description: 'إدارة الأجهزة والمعدات المستخدمة والاحتياطية وحالتها الفنية' },
      { path: 'reports', label: 'التقارير', description: 'استعراض مؤشرات الأداء والتقارير' },
    ]
  },
]
