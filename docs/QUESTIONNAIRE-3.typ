// ============================================================================
//  技术确认问卷 · 答复确认单   WES-Q-004
//  编译：typst compile --font-path <noto-cjk-sans> --font-path <noto-cjk-serif> \
//        QUESTIONNAIRE-3.typ QUESTIONNAIRE-3.pdf
// ============================================================================

#set page(
  paper: "a4",
  margin: (x: 1.7cm, y: 1.9cm),
  footer: [
    #set text(size: 8pt, fill: luma(120))
    #line(length: 100%, stroke: 0.4pt + luma(200))
    #v(2pt)
    #grid(
      columns: (1fr, auto, 1fr),
      align: (left, center, right),
      [WES 堰计算程序 · 答复确认单 WES-Q-004],
      [#context counter(page).display()],
      [2026-09-14],
    )
  ],
)

#set text(font: ("Noto Serif CJK SC", "Noto Sans CJK SC"), size: 9.5pt, lang: "zh")
#set par(justify: true, leading: 0.72em)
#show heading: set text(font: "Noto Sans CJK SC")
#show heading.where(level: 1): set block(above: 1.2em, below: 0.6em)

#let cb = box(width: 0.58em, height: 0.58em, stroke: 0.6pt + black, baseline: 0.06em)
#let blank(n) = box(width: n * 1em, height: 1.05em, stroke: (bottom: 0.5pt + luma(90)))
#let note(body) = block(
  width: 100%, inset: (x: 8pt, y: 6pt), radius: 2pt,
  fill: luma(246), stroke: (left: 2pt + rgb("#1a5fb4")),
  text(size: 9pt, body),
)
#let cfc = [#cb 确认　#cb 更正]

#align(center)[
  #text(size: 16pt, weight: "bold", font: "Noto Sans CJK SC")[
    WES 型实用堰计算程序 · 技术确认问卷
  ]
  #v(2pt)
  #text(size: 13pt, weight: "bold", font: "Noto Sans CJK SC", fill: rgb("#1a5fb4"))[
    答 复 确 认 单
  ]
  #v(6pt)
  #line(length: 68%, stroke: 0.8pt)
]

#v(4pt)
#grid(
  columns: (auto, 1fr), row-gutter: 2.5pt, column-gutter: 12pt, inset: 0pt,
  [*编号*], [WES-Q-004（针对 WES-Q-003 答复的确认）],
  [*日期*], [2026 年 9 月 14 日],
  [*回答人*], [水利工程师　（签字：#blank(7)　　日期：#blank(4)）],
)

#v(5pt)

#note[
  *为什么要再确认一次*
  #v(2pt)
  WES-Q-003 的选项串 `A 50 A A A A B C A C` 共 *10 个标记*，而按问卷结构实际有 *14 个可选位点*，
  无法唯一对应；另有若干补充栏未填。这些是*算法参数*，直接决定计算结果，
  按项目约束（"任何经验系数、取值范围必须由工程师确认"）开发方不得自行推定。
  #v(2pt)
  故列出下表：*左列是开发方的解读，右列请您勾选*。
  若解读正确，整表勾「确认」即可，无需逐字书写；若有出入，请在「更正」后写明。
]

= 1. 算法与边界条件

#table(
  columns: (auto, 1fr, auto),
  stroke: 0.4pt + luma(170), inset: 5pt,
  align: (center, left, left),
  table.header([*编号*], [*开发方的解读 / 拟定方案*], [*请勾选*]),

  [Q18-1], [迭代初值 = *A*：由开发方拟定 —— 拟取 $H_0$ 初值 $= H$（先忽略行进流速水头），迭代逼近], [#cfc],
  [Q18-2], [最大迭代次数 = *50*], [#cfc],
  [Q18-3], [不收敛时 = *A*：明确报错并停止，不输出未收敛结果], [#cfc],

  [Q19-1],
  [计算断面 = *A*：由开发方拟定并报您确认。\
   *开发方拟定*：取*堰前 $3H$ 处*（$H$ 为堰上水头）的过水断面，行近流速 $v = Q / A$，
   断面面积按实际几何计算。若倍数应取其他值，请更正：#blank(4) $H$],
  [#cfc],

  [Q19-2], [断面是否计入边墩 / 闸墩占位 —— *补充栏未填*], [#cb 计入　#cb 不计入],

  [Q20-1], [分段方式 = *A*：按桩号分段（使用者给定桩号序列或等间距）], [#cfc],
  [Q20-2], [默认分段步长 —— *补充栏未填*；开发方建议 5 m，并允许界面覆盖], [#cb 同意　#cb 更正 #blank(4)],
  [Q20-3], [是否允许使用者在界面覆盖步长], [#cb 允许　#cb 不允许],

  [Q21-1], [上游端起始断面 = *A*：堰面曲线终点（下游堰面与泄槽衔接处）], [#cfc],
  [Q21-2], [上游端起始水深 = *B*：由上游堰面曲线推求], [#cfc],
  [Q21-3], [下游端控制 = *C*：缓流与急流两者都算，程序按流态自动判断], [#cfc],
  [Q21-4], [是否同时给出缓流与急流两条水面线 —— *补充栏未填*；与 C 配套，开发方建议「需要」], [#cb 需要　#cb 不需要],

  [Q22-1], [流态判别 = *A*：计算临界水深与临界坡，按弗劳德数判别缓流 / 急流], [#cfc],
  [Q22-2], [水跃处理 = *C*：不支持水跃计算，报错提示使用者], [#cfc],

  [Q23], [淹没系数 σs 超出图 A.2.1-3 范围时 —— *整题未答*],
  [#cb A 警告并拒绝计算\
   #cb B 警告并按边界取值\
   #cb C 提示由使用者人工读图],
)

#v(4pt)
#note[
  *关于 Q19-1 的说明*　SL 253-2018 只给出 $H_0 = H + v^2/(2g)$，*未规定 $v$ 在哪个断面量取*。
  开发方提出的"堰前 $3H$ 处"仅为可复核的默认值；若您的工程习惯不同（例如取进水渠末端断面、
  或按 $(3 tilde 5)H$ 中的其他倍数），请直接更正——这一项对泄流量结果有实际影响。
]

#pagebreak()

= 2. 工程约定与交付

#table(
  columns: (auto, 1fr, auto),
  stroke: 0.4pt + luma(170), inset: 5pt,
  align: (center, left, left),
  table.header([*编号*], [*开发方的解读 / 待定事项*], [*请勾选*]),

  [Q10], [计算书导出格式 = *Excel*], [#cfc],
  [Q10-2], [不区分「完整计算过程版」与「结果摘要版」= *不需要*], [#cfc],
  [Q11], [计算书模板 = *无既定模板*，按常规格式], [#cfc],
  [Q12], [重力加速度 $g = 9.81$ m/s²], [#cfc],
  [Q13], [界面与计算书语言 = *简体中文*], [#cfc],
  [Q14], [展示层位数 = *同意*开发方建议（水头 3 位小数、流量 2 位、流速 3 位、系数 3 位、角度 2 位）], [#cfc],

  [Q8], [状态管理方案 —— *未答*], [#cb Zustand　#cb React Context],
  [Q9], [图表库 —— *未答*], [#cb ECharts　#cb Plotly.js],
  [Q15], [浏览器与平台验收范围 —— *未答*],
  [#cb 桌面四浏览器 + Android/iOS\
   #cb 仅桌面],

  [Q16],
  [*版权与版本库 —— 未答*。\
   现状：标准原件 `reference/standards/SL253-2018.pdf` 已被 `.gitignore` 排除，*未纳入版本库*；\
   `docs/FORMULAS.md` 目前只记条款号与要点，*未摘录公式原文*。\
   #cb A 可纳入版本库（限内部使用）　　#cb B 保持排除（当前状态）\
   摘录粒度：　#cb A 可摘录公式原文　　#cb B 仅记条款号与要点],
  [ ],

  [Q17], [远程仓库 / 持续集成 —— *未答*],
  [#cb 仅本地 git\
   #cb 需要远程仓库\
   #cb 需要 CI],
)

#v(8pt)

= 3. 签署

#grid(
  columns: (1fr, 1fr), row-gutter: 12pt, inset: 0pt,
  [工程师签字：#blank(11)], [日期：#blank(7)],
  [单位（盖章）：#blank(11)], [联系电话／邮箱：#blank(9)],
)

#v(5pt)
#note[
  *回传说明*　若整表解读无误，在第 1、2 节的表头处批注"全部确认"即可。
  第 1 节闭环后即可启动*阶段 1（公式完整摘录 + 算法设计 + 类型定义）*；
  第 2 节中仅 *Q16（版权与版本库）* 需尽早明确，其余可随阶段 4 一并处理。
]
