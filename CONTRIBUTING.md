# 参与贡献

Sanview 是通用三视图与空间探索工作台，支持独立练习、教师演示、家长陪学和个人空间验证。提交需求前可先阅读 [产品定位](docs/PRODUCT.md)，说明具体使用场景、遇到的问题以及预期行为。大范围交互或架构变化适合先在 Issue 中讨论；安全问题请使用 [私密报告途径](SECURITY.md)。

## 准备环境

使用 Node.js 20 或更高版本；GitHub Actions 使用 Node.js 22。

```bash
npm ci
npm start
```

应用默认在 [127.0.0.1:4173](http://127.0.0.1:4173/) 提供本地预览。静态应用没有运行时包依赖，Playwright 仅用于测试；Three.js 和 OrbitControls 已随仓库提供。

## 验证改动

```bash
npm run check
npm test
npm run build
```

首次运行浏览器测试，可执行 `npx playwright install chromium`。如果本机已有 Chrome，也可把 `SANVIEW_BROWSER` 设置为其可执行文件的绝对路径，省去下载。例如 PowerShell：

```powershell
$env:SANVIEW_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm test
```

`npm run check` 包含语法检查与单元测试，`npm test` 还包含端到端测试，`npm run build` 输出静态发布目录 `_site/`。浏览器测试自行管理临时服务器和浏览器进程。请根据改动影响选择验证范围，并在 PR 中如实记录实际执行的命令、结果及未验证部分。

涉及方向、投影、范例或随机结构时，补充能验证规则的纯逻辑测试；涉及存档、题目统计或交互流程时，覆盖对应状态变化与失败路径。界面变更还应检查桌面和移动端实际截图。Chromium 自动化通过不等于 Safari 或微信内置浏览器已经验证。

## 代码与产品约定

- 保持静态、无需账号的 HTML、CSS、JavaScript 应用形态。新增运行依赖、远程服务或框架迁移应先明确必要性。
- 观察、练习、搭建平级且独立可用。家长陪约 6–12 岁孩子学习只是常见场景，不把年龄、身份或固定课程作为功能入口条件。
- “讲解提示（家长/老师）”为可选辅助内容，教程通过 `?` 按需打开；保留学生独立练习和任意积木模型探索的使用方式。
- 坐标与投影规则集中在 `coordinates.js`；范例放在 `model-library.js`；存档校验和练习统计放在 `learning-state.js`；由 `app.js` 协调 DOM 与 3D 交互。详见 [架构说明](docs/ARCHITECTURE.md)。
- 还原任务按三幅投影判定，保留多个正确解；新增积木规则不得破坏正下方支撑约束。
- 同题重复检查不得累加题数，查看答案不能计独立完成；统计应诚实标注最近 200 题的范围。
- 作品导入先完整校验再修改模型；保存失败仍允许继续操作。清除练习记录不能意外删除作品。
- 默认界面语言为简体中文，用易懂文字说明任务和具体错误，不给出能力标签；保留键盘、触摸、静音和可辨认的焦点反馈。
- “用这个模型练习”须保留当前观察结构；手机逐幅选择三视图或回看模型不得重置已有图纸。用独立练习与共同讲解两种方式验证交互。
- 保留 [第三方声明](THIRD_PARTY_NOTICES.md) 和相关许可证；新增网络请求或存储字段时同步 [隐私说明](PRIVACY.md)。

## 提交范围

不要提交 `node_modules/`、`_site/`、`artifacts/`、浏览器报告、密钥、访问令牌、本机配置、`.source.wav` 或其他临时文件。从服务器取回的原始源码备份只留在本地，不进入公开仓库或部署物。

文档中使用的正式界面截图放在 `assets/screenshots/`，确认没有个人信息；不要把临时测试截图全部提交。修改依赖时同步锁文件，修改用户可见行为时更新说明与 `CHANGELOG.md`。

PR 描述应说明具体问题、改变后的行为、验证方式和必要的界面截图。请遵守 [社区行为准则](CODE_OF_CONDUCT.md)。发布前使用 [发布清单](docs/RELEASE_CHECKLIST.md)，以实际测试和部署结果记录状态。
