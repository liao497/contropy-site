# Cloudflare + GitHub 每日发布方案

目标仓库：[liao497/contropy-site](https://github.com/liao497/contropy-site)

## 已确认的现状

远程仓库目前只有 `index.html`、`package.json` 和 `wrangler.toml`，Cloudflare以静态资源Worker方式部署整个仓库目录。它不是当前完整看板项目，因此不能只复制一个JSON文件就获得同样的页面。

## 推荐方案

1. 先把当前完整看板迁移到 `contropy-site` 的新分支，并保留现有网站作为可回退版本。
2. 在Cloudflare的Git构建设置中使用：
   - 构建命令：`npm run build`
   - 部署命令：`npx wrangler deploy`
   - Node.js：22
3. 合并新分支后，Cloudflare会在每次GitHub提交时自动构建和部署。
4. `.github/workflows/daily-dashboard.yml` 使用固定UTC时刻映射北京时间：05:37启动晨间主任务，06:07、06:37、07:07幂等重试，16:30运行收盘刷新；采集器会再次检查A股交易日，节假日不改写网站。
5. 工作流写入新的JSON快照和Markdown归档并提交。该提交会触发Cloudflare自动部署，因此不需要在GitHub保存Cloudflare API Token。
6. `.github/workflows/dashboard-freshness-guard.yml` 独立检查晨间和收盘版本；发现旧数据会触发主工作流补跑，最终守卫仍未恢复时创建GitHub Issue，恢复提交成功后自动关闭。
6. 在Cloudflare Worker的“域和路由”中，把已注册域名绑定到这个Worker。

## 关键行为

- 晨间任务提前运行以吸收GitHub托管调度延迟；A股部分自动使用上一已完成交易日，海外部分使用实际采集时已发布的最新有效数据，目标在07:30前完成网站更新。
- 16:30收盘任务显式使用当天A股交易日，生成`close`修订并独立归档；只有数据与页面校验通过后才会替换网站当前快照。
- 报告日期显示当天，`run.market_data_date`记录A股行情实际日期。
- 周末和A股法定休市日正常退出，网站继续显示上一份有效日报。
- 某个免费源失败时保留缺口，不用旧值冒充当日值。
- 只有采集、构建和测试全部通过时才提交并触发线上更新。

## 上线前需要用户确认

- 是否允许用完整看板替换 `contropy-site` 当前的单页内容。
- 实际域名，以及希望部署在域名根路径还是 `/dashboard`。
- Cloudflare当前连接的是Pages项目还是Workers项目；远程 `wrangler.toml` 显示更像Workers静态资源项目。

实际推送、合并和线上部署属于外部发布操作，需在用户明确确认后执行。
