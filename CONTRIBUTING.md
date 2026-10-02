# 参与贡献

感谢你帮助改进积木三视图实验室。

## 开始之前

1. 先搜索现有 Issue，避免重复讨论。
2. 行为变化或较大的界面调整请先创建 Issue，说明使用场景和预期结果。
3. 安装 Node.js 20 或更高版本，然后运行 `npm install`。

## 提交代码

```bash
npm run check
```

`npm run check` 不启动浏览器。需要验证完整用户流程时，再安装并运行浏览器测试：

```bash
npx playwright install chromium
npm run test:e2e
```

- 保持项目为无框架的 HTML、CSS 和 JavaScript，除非维护者已经接受迁移提案。
- 为坐标、投影和随机生成逻辑补充单元测试。
- 为用户流程变化补充端到端测试。
- 不提交 `artifacts/`、测试报告或本地依赖。
- 不提交 API Key、访问令牌、`.source.wav` 或其他临时语音源文件。
- 界面文本默认使用简体中文，并保持适合儿童理解。

提交 Pull Request 时，请说明改动原因、验证方式，以及涉及界面时的桌面和移动端截图。
