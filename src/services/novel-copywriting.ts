/**
 * 网文简介/书名生成 Prompt 构建
 *
 * 基于真实平台调研（番茄/七猫/晋江/盐选/起点，2026-08 抓取 47 部作品）提炼的
 * 写作规范。核心：先定平台 + 男女频，再套对应公式与钩子，注入项目设定与正文节选。
 */

export type PlatformStyle = 'fanqie' | 'jinjiang' | 'yanxuan' | 'qidian'
export type Audience = 'male' | 'female' | 'unknown'

/** 平台标签与字数说明 */
export const PLATFORM_LABELS: Record<PlatformStyle, { zh: string; en: string; wordRange: string }> = {
  fanqie: { zh: '番茄/七猫风格', en: 'Fanqie/Qimao style', wordRange: '男频 100-200 字，女频 150-300 字' },
  jinjiang: { zh: '晋江风格', en: 'Jinjiang style', wordRange: '300-500 字，叙述细腻、CP 人设先行' },
  yanxuan: { zh: '知乎盐选风格', en: 'Zhihu Yanxuan style', wordRange: '导语 80-150 字 + 第一人称高能开头' },
  qidian: { zh: '起点风格', en: 'Qidian style', wordRange: '150-300 字，世界观/成长路径先行' },
}

/** 从项目受众字段推断男女频 */
export function detectAudience(targetAudience: string | undefined, genre: string | undefined): Audience {
  const t = (targetAudience ?? '').toLowerCase()
  const g = (genre ?? '').toLowerCase()
  if (t.includes('女') || g.includes('言情') || g.includes('甜宠') || g.includes('宫斗')
    || g.includes('古言') || g.includes('现言') || g.includes('纯爱') || g.includes('耽美')) return 'female'
  if (t.includes('男') || g.includes('玄幻') || g.includes('都市') || g.includes('系统')
    || g.includes('战神') || g.includes('赘婿') || g.includes('修仙') || g.includes('科幻')) return 'male'
  return 'unknown'
}

/** 简介写作规范（嵌入 system prompt 的完整规则） */
export function buildSynopsisRules(audience: Audience, platform: PlatformStyle): string {
  const maleRules = `
【男频简介公式】（选 1-2 种组合）
A. 标准打脸式：【标签】+ X年前落魄/惨遭羞辱 → X年后强势归来 → "和我比A？我A。和我比B？我B。和我比C？我C"排比 ≥3 → 一句装逼收尾
B. 金手指展示式：第一句直接甩外挂，"XX？顿悟/觉醒/提取XX！……没有什么是XX不能解决的，如果有，那就XX十次百次。"
C. 高概念引爆式：用"离谱设定"当钩子（如穿越修仙界骑三轮车卖保险），"别慌！XX为您服务！"放大荒诞感
D. 扮猪吃虎式："我不装了！我摊牌了！我一直在隐藏实力！我！XXX！[身份]！"
E. 升级史诗式（起点）：从世界规则/等级体系讲起，主角从最弱出发，"一个XX少年，如何XX，终成XX！"`

  const femaleRules = `
【女频简介公式】（选 1-2 种组合）
A. 重生复仇式：【标签】+ 前世付出+惨死收场 → "重活一世，她绝不会再让自己活成一场笑话" → "保XX，护XX，斗白莲，杀渣男"清单 → 新感情线悬念
B. CP人设反差式：第一行直接亮CP（"温婉落魄贵女vs高冷矜贵权臣""撒娇精x斯文败类"）→ 高张力场景（含一句台词）→ 情感冲突点明
C. 场景定格式：电影镜头切入（壁咚/车内对峙/雨夜堵人），"【地点+动作细节+台词】，女主的微反应"
D. 追妻火葬场式：N年付出 → 潇洒离去/事业逆袭 → 男主红着眼跪求 → 女主淡淡反击收尾
E. 标签化节奏式：结尾附标签串预告情感走向（#破镜重圆# #追妻火葬场# #双洁# #HE#）`

  const hooks = `
【钩子要求】必须至少用 2 种：
1. 身份反差钩子（"七年前……七年后……""前世……重活一世……"）
2. 悬念前置钩子（先抛结果后补原因："穿书第一天，她就知道自己活不过大结局"）
3. 高能场景钩子（电影镜头 + 一句台词）
4. 金手指展示钩子（疑问排比："体质平凡？顿悟混沌体！"）
5. 人物独白钩子（第一人称轻描淡写讲最惨的事："我穿越成了被驸马掐死的公主。这倒也不是什么大事。"）
6. 反差玩梗钩子（"重生不搞钱，路边x一条！""我只是比徒弟们强亿点点。"）`

  const platformRules: Record<PlatformStyle, string> = {
    fanqie: `
【番茄/七猫风格】
- 开头必带【】标签前缀（3-6 个，如【热血杀伐+无敌流+系统+装逼爽文】）
- 短句、口语化、多用"！"和"……"，一句一段
- 不剧透结局，只预告"爽感类型"（打脸/装逼/逆袭/甜宠）
- 女频可带"（标签串：XX+XX+双洁+HE）"
- 字数：男频 100-200 字，女频 150-300 字`,
    jinjiang: `
【晋江风格】
- 少用标签堆砌，CP 人设直接亮牌（"伪禁欲正道仙君受 × 腹黑装纯合欢宗宗主攻"）
- 叙述细腻、文艺、留白，可埋伏反转（"你……你竟真是个男子！？"）
- 文末可加【阅读指南】：年龄差/双洁/慢热
- 字数 300-500 字`,
    yanxuan: `
【知乎盐选风格】
- 第一人称；第一句必须出冲突或反转（"我穿越成了被驸马掐死的公主"）
- 简介即正文节选：直接上高能片段/内心独白，试读即正文
- 口语网感强，禁忌"文绉绉"
- 导语 80-150 字 + 可附一段正文开头`,
    qidian: `
【起点风格】
- 先立世界观/等级体系再讲主角，克制、史诗感
- 核心是"成长路径 + 金手指"预告（"一个普通山村小子，如何以平庸资质踏入修仙，笑傲三界"）
- 不搞【】标签堆砌，不口语化
- 字数 150-300 字`,
  }

  // 真实平台简介范例（保留原始换行/分段格式，供 AI 模仿排版）
  const examples: Record<PlatformStyle, Array<{ zh: string; en: string }>> = {
    fanqie: [
      {
        zh: `【热血杀伐+无敌流+师姐+装逼爽文】
七年前，家族被灭，惨遭羞辱。
七年后，叶君临携带诸位师父的通天本领强势归来！
和我比实力？我大师父武道之主，修为通神！
和我比医术？我二师父一代圣医，可起死人肉白骨！
和我比背景？我三师父一国国师，一言断人生死！
和我比美人？我有七个倾国倾城的师姐，个个都很宠我！`,
        en: `[hot-blooded invincible flow + senior sisters + showing off]
Seven years ago, his family was destroyed and he was humiliated.
Seven years later, Ye Junlin returns with his masters' divine skills!
Strength? My first master is the Lord of Martial Arts!
Medicine? My second master can raise the dead!
Power? My third master decides life and death with one word!
Beauty? I have seven stunning senior sisters who adore me!`,
      },
      {
        zh: `（末世+重生+空间+囤物资）
天灾骤降，世界巨变，先是极热，再是极寒，紧接着地震、大雾、永夜、酸雨接踵而至。
孤身在末世挣扎求生十年的苏念，最后还是死在了倾盆而下的酸雨中。
再次睁眼，苏念发现自己重生了，此时距离末世还有三个月。
当在传家宝里发现一个巨大的随身空间后，苏念给自己定下了重生后的第一个小目标——
花光21个亿，用物资把空间填满！
米面粮油？买！
鸡鸭鱼肉？买！
衣帽鞋袜？买！`,
        en: `(apocalypse + rebirth + space + stockpiling)
Disasters struck: extreme heat, extreme cold, earthquakes, fog, eternal night, acid rain.
Su Nian survived alone for ten years, then died in the acid rain.
She opens her eyes—reborn, three months before the apocalypse.
Finding a huge space in a family heirloom, she sets her first goal—
spend 2.1 billion to fill the space with supplies!
Rice and oil? Buy!
Meat and fish? Buy!
Clothes and shoes? Buy!`,
      },
    ],
    jinjiang: [
      {
        zh: `温婉落魄贵女vs高冷矜贵权臣。
季含漪十四岁家道中落，十六岁拿着婚书嫁入清贵世家谢家。
她以为婚后相敬如宾便是圆满，却在雪夜里发现，夫君心底始终装着另一个人。
幡然醒悟那晚，她烧了婚书，转身离开。
沈肆如寒夜中触不可及的高悬明月，却在她转身时开口：
"你可思量两日，愿不愿嫁我。"
心底却早已准备好下一句：你若不愿，我便再等你。`,
        en: `Gentle fallen noblewoman vs cold noble official.
At fourteen Ji Hanyi's family fell; at sixteen she married into the Xie family with a betrothal letter.
She thought respect was enough, until a snowy night revealed her husband's heart belonged to another.
That night she burned the letter and turned away.
Shen Si, unapproachable as the moon, spoke as she left:
"Think it over for two days—will you marry me?"
Already prepared: if you refuse, I will wait.`,
      },
    ],
    yanxuan: [
      {
        zh: `我穿越成了被驸马掐死的公主。
这倒也不是什么大事，反正糟蹋的不是我的身体。
要命的是，驸马发现我没死透，还想再补一刀。
窒息。
我可能刚穿过来就要死了。`,
        en: `I transmigrated into a princess strangled by her consort.
No big deal—it's not my body being ruined.
The problem: he noticed I wasn't dead, and wants to finish the job.
Choking.
I might die right after arriving.`,
      },
    ],
    qidian: [
      {
        zh: `这里是属于斗气的世界，没有花俏艳丽的魔法，有的，仅仅是繁衍到巅峰的斗气！
萧炎，萧家废物，外人嗤笑，未婚妻退婚，种种打击，竟让少年养成了不屈的性格。
三十年河东，三十年河西，莫欺少年穷！
凭借一缕异火，吞噬万物，焚尽天下，终成一代斗帝！`,
        en: `This is a world of Dou Qi—no flashy magic, only battle aura refined to its peak!
Xiao Yan, the Xiao family trash, mocked by all, divorced by his fiancée—these blows forged an unyielding spirit.
Thirty years east, thirty years west—never bully a poor youth!
With a wisp of strange fire, devouring all, he burns the world and becomes a Dou Emperor!`,
      },
    ],
  }

  const exampleText = (examples[platform] ?? [])
    .map((ex, i) => `范例${i + 1}（注意它的分段与换行格式）：\n${ex.zh}`)
    .join('\n\n')

  return `
# 网文简介 AI 写作规范（基于真实平台调研 400+ 部作品）

## 受众定位：${audience === 'male' ? '男频' : audience === 'female' ? '女频' : '男女频通用（按内容判断）'}
${audience === 'male' ? maleRules : femaleRules}
${hooks}
${platformRules[platform]}
${audience === 'male' ? maleRules.includes('E') ? '' : '' : ''}

## 真实平台范例（严格模仿其分段与换行格式）
${exampleText}

## 排版与分段格式（硬性要求，必须遵守）
1. 简介必须分段，严禁全部挤在一段里
2. 每段 1-3 句，段与段之间用空行（\\n\\n）分隔
3. 排比句每句独占一行（"和我比A？我A。\\n和我比B？我B。\\n和我比C？我C。"）
4. 【标签】独占第一段（番茄/七猫风格）
5. 台词/对话独占一段，前后用引号包裹
6. 收尾句（装逼宣言/情感标签串）独占最后一段
7. 盐选风格：每句话可独占一段，制造"一句一段"的快节奏感
8. 输出的 JSON 中 synopsis 字段的值必须包含 \\n 换行符，不能是纯单行文本

## 禁忌（硬性）
1. 禁剧透结局：不写"最后幸福在一起/成神"等结局词，只预告过程爽点
2. 禁注水：不写"本文讲述了一个……的故事"；不用"扣人心弦""精彩绝伦"等空形容词
3. 禁超过字数上限（按平台规则）
4. 禁用词："本文""本书""作者""敬请期待""女主很坚强""男主很帅"
5. 禁重复：标签与正文不得重复同一卖点
6. 第一句禁用"这是一个关于……的故事"句式
7. 标点统一中文全角，引号成对
8. 禁不分段：输出必须包含至少 3 个段落，用 \\n\\n 分隔`
}

/** 书名生成规则 */
export function buildTitleRules(platform: PlatformStyle, audience: Audience): string {
  const platformName = PLATFORM_LABELS[platform].zh
  const platformStyle: Record<PlatformStyle, string> = {
    fanqie: `- ${audience === 'female' ? '女频' : '男频'}短平快、口语化、卖点前置：
  - 身份+动作式：《高手下山，我有九个无敌师父！》《都重生了，清冷校花开局，怎么输》
  - 反差梗式：《修仙买保险，绝境我兜底》《被逼自刎，嫡女重生撕婚书覆皇朝》
  - ${audience === 'female' ? '女频常带"重生/离婚/大佬/偏执/宠"等关键词' : '男频常带"系统/无敌/下山/开局/签到"等关键词'}
  - 长度 8-15 字`,
    jinjiang: `- 文艺、意象化、留白（《娇养玫瑰》《朱门春闺》《婚后灼热》）
  - CP 或意象入题，含蓄有韵味
  - 长度 4-10 字`,
    yanxuan: `- 网感强、悬念句（《宫墙柳》《洗铅华》）
  - 反差/反转感，口语化
  - 长度 4-10 字`,
    qidian: `- 史诗感、设定感（《斗破苍穹》《凡人修仙传》）
  - 突出世界/成长/金手指格局
  - 长度 4-8 字`,
  }
  return `
# 网文书名 AI 生成规范（基于真实平台调研）
## 目标平台：${platformName}（${audience === 'female' ? '女频' : '男频'}）

## 平台风格
${platformStyle[platform]}

## 规则
1. 生成 8 个候选，每个附"理由"（说明用了哪种结构/为什么符合本项目）
2. 书名必须与故事核心强相关（金手指/人设/核心冲突至少体现一个）
3. ${audience === 'female' ? '女频可含蓄留白，避免过度卖惨' : '男频可带"！"增强爽感'}
4. 避免烂大街词堆砌（"至尊""逆天""狂婿"连用不超过 1 个）
5. 若提供原书名模仿：句式/气质模仿原书，内容完全原创，不得使用原书名中的独特词汇`
}

/** 从项目设定 + 正文节选构建上下文块 */
export function buildProjectContext(
  parts: Array<{ label: string; value: string }>,
  prose: string | undefined,
): string {
  const setting = parts
    .filter(p => p.value.trim())
    .map(p => `${p.label}：${p.value}`)
    .join('\n')
  const proseBlock = prose
    ? `\n\n【正文节选】\n${prose}`
    : ''
  return `${setting || '（暂无设定信息）'}${proseBlock}`
}
