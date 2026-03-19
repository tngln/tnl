# Canvas Interface TODO

- [x] 补一个最小 demo / example，证明 `canvas-interface` 可以独立承载窗口、surface 和 developer 基础能力
- [x] 审视 `package.json` subpath exports，区分稳定公共入口与内部实现入口
- [ ] 按 public API 分级继续收紧 exports，只在确有边界价值时新增 subpath
- [ ] 继续减少 `invalidateAll()` 的默认使用，优先走局部 invalidation
- [ ] 评估是否补齐更多通用交互 helper：hover、focus、drag session、text-input host
- [ ] 为 Developer 基础面板补更统一的结构与说明
