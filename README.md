# Obsidian Pinbox Syncer

一个用于将 [Pinbox](https://withpinbox.com) 书签同步到 Obsidian 的插件。

## 什么是 Pinbox？

[Pinbox](https://withpinbox.com) 是一个现代化的跨平台书签管理服务，帮助你在手机、电脑和浏览器之间无缝同步收藏的网页内容。

### 主要特点
- **多端同步**: 支持 iOS、Android、Chrome、Edge 等多个平台
- **一键收藏**: 在任何设备上都能快速收藏网页、文章
- **微信登录**: 支持微信扫码登录，方便快捷
- **标签管理**: 可以为收藏添加标签，便于分类整理
- **公众号适配**: 特别优化了微信公众号文章的收藏体验

### 为什么需要这个插件？

虽然 Pinbox 解决了多端收藏的问题，但对于 Obsidian 用户来说，真正的知识沉淀还是在本地的笔记库中。这个插件就是为了打通 Pinbox 和 Obsidian 之间的壁垒：

- ✅ 自动将 Pinbox 收藏同步到 Obsidian
- ✅ 完整抓取网页内容，避免链接失效
- ✅ 转换为 Markdown 格式，融入你的知识体系
- ✅ 双向管理，删除时同步云端和本地

**简单来说：在手机上用 Pinbox 收藏，回到电脑时文章已经在 Obsidian 里等你了。**

## ✨ 功能特性

### 🔄 书签同步
- **自动同步**: 支持定时自动同步 Pinbox 书签到 Obsidian
- **手动同步**: 可随时手动触发同步
- **增量同步**: 只创建新书签，不覆盖已存在的笔记

### 📝 内容抓取
- **网页内容抓取**: 自动抓取书签对应的网页内容并转换为 Markdown
- **图片保留**: 完整保留网页中的图片，支持懒加载图片
- **智能清理**: 自动移除脚本、样式和微信公众号文章的固定 footer
- **重试机制**: 对不稳定的网络请求进行最多 3 次重试
- **加载检测**: 智能检测 "loading..." 占位符，自动重试直到获取真实内容
- **微信优化**: 自动将 HTTP 协议的微信链接升级为 HTTPS，避免被浏览器拦截
- **格式优化**: 自动清理多余空行，优化列表和段落间距

### 🔐 安全登录
- **独立窗口登录**: 使用 Electron 窗口进行微信扫码登录
- **自动获取令牌**: 登录后自动获取并保存访问令牌
- **手动令牌输入**: 支持手动输入令牌作为备选方案

### 📊 Dataview 索引
- **自动创建索引**: 同步完成后自动创建 Dataview 索引文件
- **智能检测**: 首次运行时自动检测 Dataview 插件是否安装
- **自定义路径**: 支持自定义索引文件的保存位置
- **统计信息**: 显示书签总数、标签数、浏览量等统计数据

### 🗑️ 书签管理
- **精美图标**: 标题右侧显示垃圾桶图标按钮，悬停时高亮
- **智能加载**: 使用重试机制确保按钮在视图准备好后显示
- **双向删除**: 同时删除云端书签和本地笔记
- **安全确认**: 删除前显示详细的中文确认对话框
- **中文界面**: 所有通知和提示均使用中文

## 📦 安装

### 方法一：从 Obsidian 社区插件市场安装（推荐）

> ⏳ **注意**: 插件正在 Obsidian 社区插件市场上架中，审核通过后即可直接搜索安装。

上架完成后的安装步骤：
1. 打开 Obsidian 设置
2. 进入「第三方插件」→「浏览」
3. 搜索「Pinbox Syncer」
4. 点击「安装」
5. 安装完成后点击「启用」

### 方法二：使用 BRAT 安装（适合尝鲜用户）

如果你想在插件正式上架前提前体验，可以使用 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件来安装：

1. 安装 BRAT 插件
   - 打开 Obsidian 设置 → 第三方插件 → 浏览
   - 搜索「BRAT」并安装启用

2. 使用 BRAT 安装 Pinbox Syncer
   - 打开 BRAT 设置
   - 点击「Add Beta plugin」
   - 输入仓库地址：`gnuhpc/obsidian-pinbox-syncer`
   - 点击「Add Plugin」
   - 等待安装完成

3. 启用插件
   - 进入 Obsidian 设置 → 第三方插件
   - 找到「Pinbox Syncer」并启用

**BRAT 的优势**：
- ✅ 自动获取最新版本
- ✅ 可以开启自动更新
- ✅ 无需手动下载和解压文件

### 方法三：从 GitHub 手动安装

1. 下载最新的 [Release](https://github.com/gnuhpc/obsidian-pinbox-syncer/releases)
2. 解压 `main.js`, `manifest.json`, `styles.css` 到你的 vault 的插件文件夹: `<vault>/.obsidian/plugins/pinbox-syncer/`
3. 重新加载 Obsidian（快捷键：Ctrl/Cmd + R）
4. 打开 Obsidian 设置 → 第三方插件
5. 找到「Pinbox Syncer」并启用

### 方法四：开发者构建

如果你想参与开发或从源码构建：

```bash
# 克隆仓库
git clone https://github.com/gnuhpc/obsidian-pinbox-syncer.git
cd obsidian-pinbox-syncer

# 安装依赖
npm install

# 构建插件
npm run build

# 将构建产物复制到你的 vault 插件目录
cp main.js manifest.json styles.css <your-vault>/.obsidian/plugins/pinbox-syncer/
```

## 🚀 使用方法

### 首次配置

1. 打开 Obsidian 设置 → 第三方插件 → Pinbox Syncer
2. 点击"登录"按钮
3. 选择"在独立窗口中登录"
4. 使用微信扫码登录 Pinbox
5. 登录成功后，令牌会自动保存

**手动输入令牌（备选方案）**：
1. 访问 [Pinbox 登录页面](https://withpinbox.com/login) 并使用微信登录
2. 按 F12 打开浏览器开发者工具
3. 切换到 Console 标签，输入并回车：
   ```javascript
   JSON.parse(localStorage.getItem('alpha_info')).token
   ```
4. 复制显示的 token
5. 在插件设置中点击"手动输入令牌"并粘贴

### 同步书签

#### 手动同步
- 点击左侧 Ribbon 栏的同步图标 🔄
- 或使用命令面板 (Ctrl/Cmd + P)，搜索"从 Pinbox 同步书签"

#### 自动同步
1. 在设置中开启"自动同步"
2. 设置同步间隔（分钟）
3. 插件会按设置的间隔自动同步

### 管理书签

#### 删除书签
1. 打开任何同步的 Pinbox 书签笔记
2. 点击标题右侧的垃圾桶图标按钮
3. 在弹出的确认对话框中查看删除警告
4. 点击"确认删除"按钮
5. 插件会显示进度通知并同时删除云端书签和本地笔记

**提示**:
- 删除按钮默认为灰色，鼠标悬停时变为红色
- 删除操作不可撤销，请谨慎操作
- 所有界面和通知均为中文

#### 查看索引
如果启用了 Dataview 索引，打开索引文件即可查看所有书签的表格和统计信息

## ⚙️ 配置选项

### 账户认证
- **登录状态**: 显示当前登录状态
- **登录/重新登录**: 打开登录对话框

### 同步设置
- **同步文件夹**: 书签保存的文件夹位置（默认: `Pinbox`）
- **自动同步**: 是否启用定时自动同步
- **同步间隔**: 自动同步的时间间隔（分钟，默认: 60）
- **立即同步**: 手动触发一次同步

### Dataview 索引设置
- **启用 Dataview 索引**: 是否自动创建和更新索引文件
- **索引文件路径**: 索引文件的保存位置（默认: `Pinbox/!Pinbox Index.md`）
- **立即创建/更新索引**: 手动创建或更新索引文件

## 📄 笔记格式

每个同步的书签会生成一个 Markdown 文件，包含以下内容：

### Frontmatter（元数据）
```yaml
---
id: 12345678
title: "书签标题"
url: "https://example.com"
item_type: website
created_at: 2025-01-13 10:00:00
tags:
  - 标签1
  - 标签2
collection_id: 123
view: 10
brief: "简介"
description: "描述"
image: "https://example.com/image.jpg"
synced_at: 2025-01-13T10:00:00.000Z
---
```

### 正文内容
- 访问原文链接
- 用户笔记（如果有）
- 封面图片（如果有）
- 完整的网页内容（Markdown 格式）

## 🔧 依赖

### 必需
- Obsidian v0.15.0 或更高版本

### 可选
- [Dataview](https://github.com/blacksmithgu/obsidian-dataview) 插件（用于索引功能）

## 💻 技术栈

- TypeScript
- Obsidian API
- Turndown (HTML to Markdown 转换)
- Electron (用于登录窗口)

## 👨‍💻 开发

### 项目结构

```
obsidian-pinbox-syncer/
├── src/
│   ├── styles/          # 样式文件（模块化）
│   │   ├── index.css    # 样式入口
│   │   ├── layout.css   # 布局样式
│   │   ├── components.css  # 组件样式
│   │   ├── modals.css   # 模态框样式
│   │   └── README.md    # 样式文档
│   ├── authModal.ts     # 认证模态框
│   ├── callbackServer.ts # OAuth 回调服务器
│   ├── oauthServer.ts   # OAuth 服务器
│   ├── pinboxApi.ts     # Pinbox API 客户端
│   ├── pinboxLoginWindow.ts # 登录窗口
│   ├── settings.ts      # 设置定义
│   ├── settingsTab.ts   # 设置界面
│   └── syncService.ts   # 同步服务
├── main.ts              # 插件主文件
├── styles.css           # 编译后的样式（自动生成）
├── manifest.json        # 插件清单
├── esbuild.config.mjs   # esbuild 配置
├── build-styles.mjs     # 样式构建脚本
└── package.json         # 项目配置
```

### 开发命令

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 构建所有文件
npm run build

# 仅构建样式
npm run build:styles

# 代码检查
npx eslint .

# 代码检查并自动修复
npx eslint . --fix
```

### 样式开发

样式文件采用模块化组织，位于 `src/styles/` 目录:

- **开发时**: 编辑 `src/styles/` 中的各个 CSS 模块
- **构建时**: 运行 `npm run build:styles` 自动合并为 `styles.css`
- **生产时**: Obsidian 加载根目录的 `styles.css`

详细说明请参考 [src/styles/README.md](src/styles/README.md)

### 代码规范

项目使用 ESLint 进行代码质量检查:

- 遵循 Obsidian 插件最佳实践
- 使用 TypeScript 严格模式
- 避免使用 `innerHTML` 等不安全的 DOM 操作
- 所有用户界面文本使用中文

### 发布流程

1. 更新版本号（`manifest.json` 和 `package.json`）
2. 运行完整构建: `npm run build`
3. 测试所有功能
4. 创建 Git tag 并推送
5. GitHub Actions 自动创建 Release

## 📝 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 👤 作者

**gnuhpc**

- GitHub: [@gnuhpc](https://github.com/gnuhpc)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 🙏 致谢

- [Pinbox](https://withpinbox.com) - 优秀的书签管理服务
- [Obsidian](https://obsidian.md) - 强大的知识管理工具
- [Turndown](https://github.com/mixmark-io/turndown) - HTML 到 Markdown 转换库

## 📋 更新日志

### v1.0.0 (2025-01-13)

- ✨ 初始版本发布
- 🔄 支持书签同步
- 📝 网页内容抓取
- 🔐 微信扫码登录
- 📊 Dataview 索引
- 🗑️ 书签删除功能
- ⚙️ 完整的配置选项

## ⚠️ 注意事项

- 请妥善保管你的 access token，不要分享给他人
- Token 可能会过期，需要定期更新
- 此插件为非官方插件，与 Pinbox 官方无关
- 使用前请备份重要数据
