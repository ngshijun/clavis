export default {
  header: {
    login: '登录',
    bookDemo: '预约演示',
  },
  hero: {
    badge: '专为华小补习中心打造——符合 KSSR（修订版 2017）课程纲要',
    titleBefore: '补习中心的',
    titleHighlight: '一站式运营平台',
    description:
      'Clavis 为您的中心提供按掌握程度编排练习的引导式学习地图、自动批改的测评系统，以及让每位老师清楚掌握每个学生进度的数据面板。',
    bookDemo: '预约演示',
    login: '登录',
    stats: {
      questionsValue: '2,000+',
      questionsLabel: '紧贴课纲的题目',
      levelsValue: '一至六年级',
      levelsLabel: '华小 KSSR（修订版 2017）',
      gradingValue: '100%',
      gradingLabel: '测评自动批改',
    },
  },
  features: {
    title: '运营中心所需的一切',
    subtitle: '一个平台服务整个中心——管理员运营中心，老师管理班级，学生按路径练习',
    items: [
      {
        title: '引导式学习地图',
        description:
          '每个科目都是一条有序的学习路径。学生始终知道下一步该练什么，进度凭实际掌握程度解锁——不靠猜测',
      },
      {
        title: '像填表一样创建测评',
        description: '老师几分钟内即可组卷——挑选题目、设置时限、指派给班级。无需纸张，无需复印',
      },
      {
        title: '自动批改，即时出分',
        description: '学生提交后立即完成批改。老师直接查看分数和逐题分析，一份卷子都不用改',
      },
      {
        title: '为每个角色而设',
        description:
          '管理员运营中心，老师管理自己的班级，学生专注练习。每个角色只看到自己需要的内容',
      },
      {
        title: '掌握度数据面板',
        description:
          '班级与学生的掌握度、练习活跃度、测评完成率一目了然——并提前标记有掉队风险的学生',
      },
      {
        title: '紧贴课纲的题库',
        description: '每道题目都遵循华小 KSSR（修订版 2017）课程纲要，练习和测评始终与学校教学一致',
      },
    ],
  },
  howItWorks: {
    title: '使用方法',
    subtitle: '三个步骤，从开通到洞察',
    steps: [
      {
        title: '开通您的中心',
        description: '我们为您的中心配置管理员、老师和学生账号——按学生席位开通，即刻可用',
      },
      {
        title: '老师指派，学生练习',
        description: '老师创建班级、指派测评，学习地图引导每位学生的日常练习',
      },
      {
        title: '实时追踪掌握度',
        description: '数据面板汇总每个班级的掌握度、活跃度和风险学生——老师和管理员都能掌握全局',
      },
    ],
  },
  pricing: {
    title: '简单的按席位定价',
    subtitle: '一个方案包含全部功能，只按实际使用的学生席位付费',
    planName: '按席位',
    planDescription: '全部功能、全部角色，按学生席位计费',
    priceLabel: '按席位授权',
    priceNote: '按学生席位每月计费——联系我们为您的中心获取报价',
    features: [
      '每位学生的引导式学习地图',
      '测评创建与自动批改',
      '包含老师、管理员和学生账号',
      '掌握度与风险学生数据面板',
      '完整华小 KSSR 题库（一至六年级）',
      '中英双语界面',
    ],
    contactUs: '联系我们获取报价',
  },
  contact: {
    title: '预约演示',
    subtitle: '告诉我们您的中心情况，我们将为您完整演示平台——无需任何承诺',
    name: '姓名',
    namePlaceholder: '您的姓名',
    email: '电子邮件',
    emailPlaceholder: 'your.email@example.com',
    subject: '中心名称',
    subjectPlaceholder: '您的补习中心',
    message: '内容',
    messagePlaceholder: '介绍一下您的中心——学生人数、涵盖年级等...',
    submit: '预约演示',
    submitting: '发送中...',
    successMessage: '请求已发送！我们会尽快与您联系。',
    errorMessage: '发送失败，请稍后再试。',
  },
  cta: {
    title: '准备好让 Clavis 助力您的中心了吗？',
    subtitle: '预约演示，亲身体验学习地图、测评系统和数据面板',
    bookDemo: '预约演示',
    login: '登录',
  },
  footer: {
    tagline: '拉丁语意为"钥匙"——开启每位学生的潜力。',
    login: '登录',
    forgotPassword: '忘记密码',
    copyright: 'Clavis. 保留所有权利。',
  },
} as const
