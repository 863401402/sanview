# 开源发布清单

## 仓库

- [ ] 设置准确的仓库描述、主页地址、Topics 和社交预览图；
- [ ] 确认默认分支为 `main`，启用分支保护并要求 `check` 与 `e2e` 通过；
- [ ] 在 Settings > Pages 中选择 GitHub Actions 作为发布来源；
- [ ] 启用 Private vulnerability reporting 和 Dependabot alerts；
- [ ] 根据维护团队补充仓库所有者、联系方式或 `CODEOWNERS`；
- [ ] 创建首个版本标签，并把 `CHANGELOG.md` 的 Unreleased 内容归入该版本。

## 安全与许可

- [ ] 吊销并重新创建任何曾出现在聊天、终端记录或其他非密钥管理环境中的 API Key；
- [ ] 确认 Git 历史、源码、构建产物和截图中没有凭据或个人信息；
- [ ] 核对生成语音时适用的 MiMo 条款，确认音频允许公开再分发；
- [ ] 保留 Three.js 和 OrbitControls 的版权与许可说明；
- [ ] 如果部署方加入统计、账号或联网服务，同步更新 `PRIVACY.md`。

## 质量

- [ ] 运行 `npm ci` 和 `npm run check`；
- [ ] 经维护者批准后运行 `npm run test:e2e`，检查桌面与移动端截图；
- [ ] 用 Chrome、Safari 和微信内置浏览器各完成一次核心流程；
- [ ] 使用键盘完成模式切换、画视图和俯视搭建盘操作；
- [ ] 验证静音、语音失败回退、首次教程和清除站点数据后的行为；
- [ ] 在 GitHub Pages 的最终 URL 上检查所有脚本、MP3、截图和 favicon 均返回成功。

## 发布后

- [ ] 创建带截图、功能摘要和已知限制的 GitHub Release；
- [ ] 用普通访客账号验证 Issue 表单、Pull Request 模板和安全报告入口；
- [ ] 记录首批真实教师或学生反馈，优先修复理解偏差和触摸操作问题。
