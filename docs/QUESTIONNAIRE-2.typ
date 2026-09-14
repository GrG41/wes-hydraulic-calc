// ============================================================================
//  WES 型实用堰泄流能力与堰流水面线计算程序
//  技术确认问卷（补充）  WES-Q-003
//  编译：typst compile --font-path <noto-cjk-sans> --font-path <noto-cjk-serif> \
//        QUESTIONNAIRE-2.typ QUESTIONNAIRE-2.pdf
// ============================================================================

#set page(
  paper: "a4",
  margin: (x: 1.9cm, y: 2.0cm),
  footer: [
    #set text(size: 8pt, fill: luma(120))
    #line(length: 100%, stroke: 0.4pt + luma(200))
    #v(2pt)
    #grid(
      columns: (1fr, auto, 1fr),
      align: (left, center, right),
      [WES 堰计算程序 · 技术确认问卷（补充）WES-Q-003],
      [#context counter(page).display()],
      [2026-09-14],
    )
  ],
)

#set text(font: ("Noto Serif CJK SC", "Noto Sans CJK SC"), size: 10pt, lang: "zh")
#set par(justify: true, leading: 0.78em)
#show heading: set text(font: "Noto Sans CJK SC")
#show heading.where(level: 1): set block(above: 1.3em, below: 0.7em)
#show heading.where(level: 2): set block(above: 1.0em, below: 0.5em)

#let cb = box(width: 0.62em, height: 0.62em, stroke: 0.6pt + black, baseline: 0.06em)
#let blank(n) = box(width: n * 1em, height: 1.1em, stroke: (bottom: 0.5pt + luma(90)))
#let note(body) = block(
  width: 100%, inset: (x: 8pt, y: 6pt), radius: 2pt,
  fill: luma(246), stroke: (left: 2pt + rgb("#1a5fb4")),
  text(size: 9pt, body),
)

#align(center)[
  #text(size: 8.5pt, fill: luma(110))[委托方：水利工程师]
  #v(4pt)
  #text(size: 17pt, weight: "bold", font: "Noto Sans CJK SC")[
    WES 型实用堰泄流能力与堰水面线计算程序
  ]
  #v(3pt)
  #text(size: 14pt, weight: "bold", font: "Noto Sans CJK SC", fill: rgb("#1a5fb4"))[
    技术确认问卷（补充）
  ]
  #v(8pt)
  #line(length: 70%, stroke: 0.8pt)
]

#v(4pt)
#grid(
  columns: (auto, 1fr), row-gutter: 3pt, column-gutter: 12pt, inset: 0pt,
  [*问卷编号*], [WES-Q-003（WES-Q-002 的补充）],
  [*编制日期*], [2026 年 9 月 14 日],
  [*回答人*], [水利工程师　（签字：#blank(8)　　日期：#blank(5)）],
)

#v(6pt)

#note[
  *为什么还有一份补充问卷*
  #v(3pt)
  WES-Q-002 第 3 节确认的是*标准里有明文答案*的公式与系数 —— 那部分已全部闭环，感谢。
  但还有一类问题，*标准本身没有规定*，必须由工程师确定：行进流速水头在哪个断面量取、
  水面线如何分段、上下游边界怎么定、流态如何判别。这些是*阶段 1 算法设计与阶段 2 编码的前置*，
  在此之前无法动工。故补充本问卷。
  #v(3pt)
  第 2 节（Q8–Q17）是原问卷第 5 节未答复的部分，一并列出，避免再跑一趟。
  填写方式同前：*绝大多数只需勾选*；选「其他」时请写在横线上。
]

= 1. 算法与边界条件（阻塞阶段 1 与阶段 2）

#note[
  本节的共同背景：SL 253-2018 给出了*计算公式*，但没有规定*算法层面的选择*。
  这些选择直接决定计算结果，开发方不得自行假定。
]

== Q18　行进流速水头的迭代参数

*背景*　标准 A.2.1-3 给出 $H_0 = H + v^2 / (2g)$。但 $v$ 取决于过流面积，面积又取决于流量 $Q$，
故 $H_0$ 与 $Q$ 必须*迭代求解*。您已确认收敛判据为「相对残差 $1 times 10^(-6)$，对 $Q$ 与 $H_0$ 分别判定」（Q5 = A）。
尚缺三项参数：

#grid(
  columns: (auto, 1fr), row-gutter: 6pt, inset: 0pt, column-gutter: 6pt,
  [*初值*], [#cb A 由开发方拟定（拟取 $H_0$ 初值 $= H$，即先忽略行进流速水头）　　#cb B 您指定：#blank(12)],
  [*最大迭代次数*], [#blank(5)（开发方建议 50）],
  [*不收敛时*], [#cb A 明确报错并停止　　#cb B 提示并输出最后一次结果（标注"未收敛"）　　#cb C 其他：#blank(10)],
)

== Q19　行进流速水头的计算断面

*背景*　标准只给出公式 $H_0 = H + v^2 / (2g)$，*未规定 $v$ 应在哪一个断面量取*。
断面位置直接影响 $v$、进而影响 $H_0$ 与泄流量，属必须由工程师确定的事项。

#grid(
  columns: (auto, 1fr), row-gutter: 6pt, inset: 0pt, column-gutter: 6pt,
  [#cb], [*A.* 由开发方按工程惯例拟定并报您确认（例如：取堰前 $(3 tilde 5)H$ 处的过水断面，面积按实际断面几何计算）],
  [#cb], [*B.* 由您指定 —— 断面位置规则：#blank(16)；断面形状与面积算法：#blank(14)],
  [#cb], [*C.* 行进流速水头*忽略不计*（取 $H_0 = H$）—— 属重大简化，需您明确同意并说明适用条件],
)
补　断面是否需计入边墩 / 闸墩占位？　#cb 需要　　#cb 不需要

== Q20　水面线的分段方式

*背景*　标准 A.3.1 给出分段求和公式 $Delta l = f(h_1, h_2, dots)$，但*未规定如何分段*。

#grid(
  columns: (auto, 1fr), row-gutter: 6pt, inset: 0pt, column-gutter: 6pt,
  [#cb], [*A.* 按*桩号*分段（用户给定桩号序列或等间距）—— 工程习惯],
  [#cb], [*B.* 按*水深*分段（等水深差）],
  [#cb], [*C.* *自适应步长*（按局部截断误差自动调整）],
  [#cb], [*D.* 其他：#blank(24)],
)
补　默认步长 #blank(5)；是否允许使用者在界面覆盖？　#cb 允许　　#cb 不允许

== Q21　水面线的边界条件

*背景*　分段求和必须明确从哪一端起算。上下游两端都需指定。

#grid(
  columns: (auto, 1fr), row-gutter: 8pt, inset: 0pt, column-gutter: 6pt,
  [*上游端断面*], [#cb A 堰面曲线终点（下游堰面与泄槽衔接处）　　#cb B 泄槽起点桩号　　#cb C 其他：#blank(10)],
  [*上游端水深*], [#cb A 取临界水深　　#cb B 由上游堰面曲线推求　　#cb C 用户给定 #blank(5)　　#cb D 其他：#blank(8)],
  [*下游端控制*], [#cb A 用户给定下游水位，程序*自下而上*推算　　#cb B 由临界水深控制，程序*自上而下*推算],
  [ ], [#cb C 两者都算，程序按流态自动判断　　#cb D 其他：#blank(16)],
)
补　是否需要程序同时给出缓流与急流两条可能的水面线供使用者判断？　#cb 需要　　#cb 不需要

== Q22　流态判别与临界水深

#grid(
  columns: (auto, 1fr), row-gutter: 6pt, inset: 0pt, column-gutter: 6pt,
  [#cb], [*A.* 计算临界水深与临界坡，按弗劳德数判别缓流 / 急流],
  [#cb], [*B.* 仅按底坡与临界坡比较作定性判别],
  [#cb], [*C.* 暂不判别],
)
补　若计算中遇到急流向缓流过渡（水跃）：\
#h(1.4em) #cb *A.* 仅报告水跃发生的桩号与共轭水深，不做详细水跃计算 \
#h(1.4em) #cb *B.* 做完整水跃计算（须另立公式依据，请注明来源：#blank(12)） \
#h(1.4em) #cb *C.* 不支持，报错提示使用者

== Q23　淹没系数 σs 超出图 A.2.1-3 范围时的处理

*背景*　图 A.2.1-3 的取值域有限（横轴 $P_1 / H_d$、纵轴 $h_s / H_0$）。参数落在图外时如何处理？

#grid(
  columns: (auto, 1fr), row-gutter: 6pt, inset: 0pt, column-gutter: 6pt,
  [#cb], [*A.* 明确警告并*拒绝计算*（符合项目约束"不静默处理超范围输入"）],
  [#cb], [*B.* 警告并*按边界取值*继续计算（请注明取法：#blank(12)）],
  [#cb], [*C.* 提示由使用者按图*人工读图*输入],
  [#cb], [*D.* 其他：#blank(22)],
)

#pagebreak()

= 2. 工程约定与交付（原问卷 Q8–Q17）

#grid(
  columns: (auto, 1fr), row-gutter: 8pt, inset: 0pt, column-gutter: 6pt,

  [*Q8*], [状态管理：　#cb Zustand（开发方推荐）　　#cb React Context],

  [*Q9*], [图表库：　#cb ECharts（开发方推荐，离线打包与中文标注更有利）　　#cb Plotly.js],

  [*Q10*], [计算书导出格式（可多选，请标优先级）：　#cb Excel　　#cb Word（可编辑）　　#cb PDF
            　优先级：#blank(10)
            #v(2pt)
            是否需要区分「*完整计算过程版*」与「*结果摘要版*」？　#cb 需要　　#cb 不需要],

  [*Q11*], [计算书模板：　#cb 无既定模板，按常规格式　　#cb 有，请随问卷附上],

  [*Q12*], [重力加速度取值：　#cb 9.81（与项目文件一致，开发方推荐）　　#cb 9.80665
            #v(1pt)
            #text(size: 8.5pt, fill: luma(90))[标准中 $g$ 仅作为符号出现，未给数值；两者相差约 0.03%。]],

  [*Q13*], [界面与计算书语言：　#cb 简体中文（开发方推荐）　　#cb 中英对照],

  [*Q14*], [展示层有效位数（项目文件规定"中间计算禁止提前舍入，仅在展示层格式化"）。
            开发方建议：水头 3 位小数、流量 2 位、流速 3 位、系数 3 位、角度 2 位。
            　#cb 同意　　#cb 更正：#blank(18)],

  [*Q15*], [浏览器与平台验收范围：　#cb 桌面四浏览器（Chrome/Edge/Firefox/Safari）＋ Android/iOS（开发方推荐）
            　　#cb 仅桌面],

  [*Q16*], [*版权与版本库*（当前已实际影响仓库）：
            #v(2pt)
            标准原件 `reference/standards/SL253-2018.pdf` 目前被 `.gitignore` 排除，*未纳入版本库*。
            #v(2pt)
            　#cb A 可纳入版本库（限内部使用）　　#cb B 保持排除，仅本地留存（当前状态）
            #v(2pt)
            `docs/FORMULAS.md` 的摘录粒度：
            　#cb A 可摘录公式原文　　　#cb B 仅记条款号与要点，原文不入库（当前状态）],

  [*Q17*], [远程仓库 / 持续集成：　#cb 仅本地 git（当前状态）　　#cb 需要远程仓库　　#cb 需要 CI],
)

#v(10pt)

= 3. 签署

#grid(
  columns: (1fr, 1fr), row-gutter: 14pt, inset: 0pt,
  [工程师签字：#blank(12)], [日期：#blank(8)],
  [单位（盖章）：#blank(12)], [联系电话／邮箱：#blank(10)],
)

#v(6pt)
#note[
  *回传说明*　本问卷第 1 节（Q18–Q23）是*阶段 1 算法设计的前置*；
  第 2 节（Q8–Q17）阻塞阶段 4 的界面与导出实现，可稍后答复。
  #v(3pt)
  如实填写即可；若有任何一项倾向"由开发方拟定后复核"，勾选相应选项并在横线上注明您的附加要求。
]
