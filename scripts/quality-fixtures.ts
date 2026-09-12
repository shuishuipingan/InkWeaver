import { createHash } from 'node:crypto'

export const QUALITY_FIXTURE_VERSION = '1' as const

export type QualityTransitionKind =
  | 'immediate'
  | 'time-jump'
  | 'location-change'
  | 'viewpoint-change'
  | 'flashback'
  | 'deferred-payoff'

export interface ChapterPairQualityCase {
  id: string
  kind: QualityTransitionKind
  previousChapter: string
  nextChapter: string
  expectedSignals: string[]
}

function pair(
  kind: QualityTransitionKind,
  index: number,
  previousChapter: string,
  nextChapter: string,
  expectedSignals: string[],
): ChapterPairQualityCase {
  return { id: `Q-${kind}-${index}`, kind, previousChapter, nextChapter, expectedSignals }
}

/**
 * Public, synthetic chapter-pair prompts for blind continuity review. These
 * are intentionally short and contain no user manuscript text. Four cases per
 * category keep the evaluation set balanced while reviewers score the paired
 * output independently of the case id.
 */
export const FIXED_CHAPTER_PAIR_CASES: readonly ChapterPairQualityCase[] = [
  pair('immediate', 1, '门后传来第二次敲击，林夏握住旧钥匙。', '她没有离开码头，先把钥匙插进门缝。', ['现场连续', '动作承接']),
  pair('immediate', 2, '顾舟答应替她守住信箱，远处的灯忽然熄灭。', '灯灭后顾舟先检查信箱，再追向堤岸。', ['承接承诺', '现场变化']),
  pair('immediate', 3, '守门人叫出林夏的旧名，钥匙落在水沟边。', '她先捡回钥匙，才追问守门人为何知道旧名。', ['未完成动作', '悬念保留']),
  pair('immediate', 4, '顾舟看见墙上的第三道刻痕，决定不告诉同伴。', '他把刻痕拓下来藏进袖口，转身装作没有发现。', ['情绪延续', '秘密边界']),
  pair('time-jump', 1, '暴雨封住山路，林夏把信塞进防水袋。', '三天后雨停，她发现防水袋的封口被人拆过。', ['时间交代', '状态后果']),
  pair('time-jump', 2, '顾舟在诊所等待检查结果，担心错过船期。', '翌日清晨，他带着未拆的报告登上最后一班船。', ['时间跳跃', '未解问题']),
  pair('time-jump', 3, '灯塔守夜人答应天亮前回信。', '一周后仍没有回信，林夏开始核对旧航日志。', ['延迟兑现', '行为变化']),
  pair('time-jump', 4, '顾舟把受伤的手藏在桌下，拒绝休息。', '半个月后伤口结痂，他仍不敢用力握刀。', ['恢复时间', '限制延续']),
  pair('location-change', 1, '仓库门在潮声里合上，林夏听见里面有人走动。', '她在渡船上回放刚才听到的脚步声，发现少了一拍。', ['地点变化', '现场信息保留']),
  pair('location-change', 2, '顾舟在旧车站烧掉一页名单。', '回到旅馆后，他从灰烬里找出半个名字。', ['转场后果', '道具延续']),
  pair('location-change', 3, '林夏在灯塔顶层看到海面上的白帆。', '下到礁石滩后，她发现白帆停在不可能靠岸的位置。', ['空间关系', '疑问推进']),
  pair('location-change', 4, '守门人在巷口放开林夏，却没有归还信件。', '她进入书店避雨，用橱窗倒影观察谁跟了进来。', ['转场动机', '威胁延续']),
  pair('viewpoint-change', 1, '林夏把秘密写进信里，却没有寄出。', '顾舟在另一条街捡到一张没有署名的纸条。', ['视角切换', '读者信息控制']),
  pair('viewpoint-change', 2, '守夜人看见灯塔熄灭，决定隐瞒原因。', '林夏只知道灯灭了，不知道守夜人已经改了航标。', ['角色知情边界', '悬念保持']),
  pair('viewpoint-change', 3, '顾舟在门外听见林夏说出弟弟的名字。', '弟弟的视角落在一枚刚被藏好的钥匙上。', ['多视角钩子', '信息差']),
  pair('viewpoint-change', 4, '林夏以为信来自过去，仍保留了怀疑。', '写信人的视角揭示他只是在模仿旧笔迹。', ['不可靠解释', '角色未知信息']),
  pair('flashback', 1, '林夏在墙上看到童年刻痕，手指停在裂缝边。', '回忆中她想起父亲曾说“第三道刻痕不要碰”。', ['回忆触发', '规则延续']),
  pair('flashback', 2, '顾舟听见旧船笛，想起第一次把钥匙交给陌生人。', '回忆结束时他意识到那人当时戴着同一枚戒指。', ['回忆边界', '新证据']),
  pair('flashback', 3, '守夜人翻到发黄的值班簿，停在二十年前的日期。', '那段回忆解释了他为何一直避开北侧灯室。', ['过去原因', '现在行为']),
  pair('flashback', 4, '林夏梦见弟弟站在潮线外，醒来时信纸已湿。', '她无法确认梦境，却把湿掉的字逐一抄回。', ['梦境标记', '不确定性']),
  pair('deferred-payoff', 1, '林夏发现钥匙背面刻着半个坐标，没有立即寻找终点。', '她先完成与顾舟的交换，第三章才回到坐标。', ['刻意延后', '作者计划']),
  pair('deferred-payoff', 2, '顾舟听见门内有人叫他的名字，却选择先救受伤的守门人。', '救人后他仍记得门内的声音，悬念没有被抹掉。', ['延迟回应', '优先级解释']),
  pair('deferred-payoff', 3, '林夏看到信封上的未来日期，把问题留给下一卷。', '下一卷开篇她先处理眼前的追捕，再重新打开信封。', ['跨卷悬置', '回收准备']),
  pair('deferred-payoff', 4, '守夜人承诺讲出真相，但要求等灯塔重新点亮。', '灯塔亮起后他只说出一半，剩余秘密继续留在账本里。', ['部分兑现', '悬念保留']),
]

export interface LongFormQualityChapter {
  chapterNumber: number
  title: string
  volume: string
  viewpoint: string
  body: string
  facts: string[]
  readerKnowledge: string[]
}

const volumes = ['潮汐卷', '旧港卷', '回声卷', '北灯卷'] as const
const viewpoints = ['林夏', '顾舟', '守夜人'] as const

/** Build a deterministic 100-chapter synthetic novel for retrieval/expiry tests. */
export function buildLongFormQualityFixture(): LongFormQualityChapter[] {
  return Array.from({ length: 100 }, (_, index) => {
    const chapterNumber = index + 1
    const volume = volumes[Math.min(volumes.length - 1, Math.floor(index / 25))]!
    const viewpoint = viewpoints[index % viewpoints.length]!
    const facts = [
      `${viewpoint}在第${chapterNumber}章记录潮汐刻度${(chapterNumber % 7) + 1}`,
      `第${chapterNumber}章的地点是${chapterNumber % 2 === 0 ? '旧港仓库' : '北侧码头'}`,
    ]
    const readerKnowledge = [`读者知道第${chapterNumber}章留下了线索${(chapterNumber % 9) + 1}`]
    if (chapterNumber === 12) facts.push('林夏在第12章取得旧钥匙')
    if (chapterNumber === 18) facts.push('旧钥匙在第18章转交给顾舟')
    if (chapterNumber === 30) facts.push('顾舟在第30章受伤')
    if (chapterNumber === 40) facts.push('顾舟在第40章恢复行动')
    if (chapterNumber === 55) facts.push('林夏在第55章得知灯塔的秘密')
    if (chapterNumber === 70) readerKnowledge.push('读者在第70章确认信件来自未来')
    return {
      chapterNumber,
      title: `灯塔档案 · 第${chapterNumber}章`,
      volume,
      viewpoint,
      body: `${viewpoint}在${volume}继续核对潮汐记录。第${chapterNumber}章的决定改变了下一步行动，但仍留下可追踪的疑问。`,
      facts,
      readerKnowledge,
    }
  })
}

export function hashQualityFixture(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')
}
