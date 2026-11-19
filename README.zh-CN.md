# dsh-synthesizer

[English](./README.md) | **简体中文**

DeepSeek Harness 里的多轨 Web Audio 合成器与口袋律动工作站（Groovebox）。在钢琴卷帘或 8 件套鼓机步进器上编曲，通过实时减法合成器塑形音色并循环播放；切回对话后音乐可在后台继续播放，侧栏底部支持快捷播放/暂停与静音，同时提供 `/synth` AI 编曲与 WAV/MIDI 导出。工程连同音色参数保存在当前 profile 的 `storages/dsh-synthesizer/projects/`。

## 界面与工作流

页面分三层：顶栏（播放控制、BPM、小节数、`×2` 倍增小节、摇摆、循环、工程面板、撤销、帮助、设置）、左侧音轨列表（支持互斥独奏 `S`、静音 `M`、乐器切换、音量与立体声声像），以及右侧的钢琴卷帘 / 鼓机网格。网格下方抽屉包含三个标签：

- **音色**：支持 8 种旋律乐器（主音 `lead`、贝斯 `bass`、铺底 `pad`、键盘 `keys`、酸液 `acid`、拨弦 `pluck`、红白机 `chip`、星际铃 `bell`），每种内置 3–4 个预设音色，提供明亮度、咬字、厚度、空间 4 个宏旋钮及完整的波形、失谐、低八度、过载、滤波器、ADSR、LFO、延迟与混响参数。鼓轨可切换 4 套鼓组（电子鼓 `classic`、808、磁带 Lo-Fi、8-Bit）并试听全部 8 个鼓件。
- **编曲**：12 个根音与 8 种调式高亮（小调、大调、多利亚、混合利底亚、弗里几亚、五声、布鲁斯、半音阶）、和弦画笔（单音 / 三和弦 / 七和弦）、一键生成鼓组（5 种节奏）与旋律（5 种乐句）、欧几里得 `E(5,16)` 打击乐叠加、鼓组加花、调式吸附、力度人性化、升降八度、首小节平铺与清空音轨。
- **弹奏**：双八度屏幕琴键、电脑键盘 `A–L` 弹奏（`Z/X` 切八度）、Web MIDI 外接键盘输入，以及 `R` 键边弹边录（播放时将弹奏音符量化写入当前音轨）。

所有编辑均支持 `⌘Z / Ctrl+Z` 撤销。

## AI 编曲与 `/synth` 命令

插件向宿主注册了 4 个 Agent 工具（`synthesizer_list_projects`、`synthesizer_get_project`、`synthesizer_save_project`、`synthesizer_update_track`）、`dsh-synthesizer:composition` 系统提示词以及 `/synth` 斜杠命令：

- `/synth <曲风/速度/乐器描述> [--seed <seed>]` — 让模型按描述创作完整多轨工程并同步至合成器。每次自动生成随机 seed（或使用指定的 `--seed`），变化曲式结构、律动风格、调式、和弦进行、贝斯线与旋律轮廓，避免千篇一律的编曲走向。
- `/synth groove [bpm] [--seed <seed>]` — 按 seed 快速生成多轨律动并立即同步，无需唤醒模型。
- `/synth list` — 查看当前已保存的工程列表。
- `/synth help` — 查看命令说明。

模型保存或更新工程后，前端编辑器会自动同步加载（若本地有未保存改动则弹出切换提示）。

## 工程、设置与导出

- **工程面板**：打开、搜索（超过 8 个工程时显示）、重命名、复制、导入/导出（`.dsh-synth.json`）及删除（10 秒内可在底部提示撤销）。内置 **8 首示范曲**（霓虹夜驾、雨夜自习室、酸液仓库、红白机冒险、深空漂流、午夜舞池、磁带黄昏、暗涌 808）与随机律动生成。最多保存 32 个工程（单个上限 256KB），编辑后 500ms 自动保存。
- **设置面板**：切换界面语言（跟随系统 / 简体中文 / English）、开关侧栏快捷控制与后台持续播放、调节主音量与侧链闪避强度（关闭 / 标准 / 强力）、开关绘制试听 / QWERTY 琴键 / 幽灵音符 / 示波器、查看已连接 MIDI 设备以及重置设置。
- **导出**：支持导出多轨 MIDI（鼓在第 10 通道，含摇摆时间偏移）或与实时播放一致的离线渲染 WAV（自动跳过静音音轨）。

## 合成引擎

每条旋律轨均为实时 Web Audio 减法合成器：支持锯齿/方波/三角/正弦波形、齐奏失谐、低八度副振荡器、饱和过载、带键位跟踪与包络调制的低通滤波器、ADSR 包络、连奏滑音（`acid` / `bass` / `lead`）、单音符独立 LFO（音高/滤波/音量），以及随速度同步的乒乓延迟与算法混响，经侧链闪避总线进入主压缩器。鼓轨内置 8 件套合成鼓与开镲闭镲互斥（choke）。

界面主题自动适配宿主的 `--dsw-alias-*` 亮色/暗色变量。

## 安装

```bash
npm install
npm run build
dsh plugin --profile <profile> add /path/to/dsh-synthesizer
```

Host Fetch 路由仅投递精确的 `GET` 与 `POST`：`GET /api/dsh-synthesizer/projects`（带 `?id=` 读取单个工程）、`POST /api/dsh-synthesizer/projects` 保存、`POST /api/dsh-synthesizer/projects/delete` 删除。

## 开发

```bash
npm run typecheck
npm test
npm run build
```

## 许可证

MIT
