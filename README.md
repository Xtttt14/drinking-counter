# drinking-counter

饮水提醒是一个本地 Windows 桌面饮水统计与提醒工具。它使用 Electron、React 和 Vite 构建，数据保存在本机，适合在工作时间常驻托盘，记录每天喝了多少水，并在太久没有喝水时发出系统通知。

## 功能

- 选择常用杯子容积后进入今日进度页
- 一键记录一杯水，支持撤销上一杯
- 今日饮水进度展示，支持杯数和毫升两种视图
- 可在进度页设置每日目标杯数
- 默认工作时间提醒：`09:30-18:30`
- 默认久未喝水提醒：`60` 分钟
- 支持重复提醒，默认间隔 `15` 分钟
- 关闭窗口时可选择隐藏到托盘或退出程序
- 支持记住关闭偏好，减少重复确认
- 数据和设置保存在本地，不依赖云服务

## 技术栈

- Electron
- React
- Vite
- electron-store
- lucide-react
- electron-builder

## 开发运行

先安装依赖：

```powershell
npm install
```

启动开发环境：

```powershell
npm start
```

这个命令会启动 Vite 开发服务器，并在服务可用后打开 Electron 应用。

## 构建

构建前端资源：

```powershell
npm run build
```

打包 Windows 桌面程序：

```powershell
npm run dist
```

打包后的程序位于：

```text
release/win-unpacked/饮水提醒.exe
```

## 项目结构

```text
drinking-counter/
├─ electron/
│  ├─ main.js
│  └─ preload.js
├─ src/
│  ├─ App.jsx
│  ├─ main.jsx
│  └─ styles.css
├─ index.html
├─ vite.config.mjs
├─ package.json
└─ README.md
```

## 数据说明

应用使用 `electron-store` 在本地保存饮水记录和设置。记录按日期存储，设置包括目标杯数、杯子容积、提醒时间段、久未喝水阈值、重复提醒间隔和关闭窗口偏好。

## 注意

- `dist/`、`release/` 和 `node_modules/` 不提交到仓库。
- 如需发布安装包或可执行文件，建议使用 GitHub Releases，而不是直接提交打包产物。
- Vite 配置中使用了 `base: "./"`，用于保证 Electron 打包后通过 `file://` 加载资源时页面正常显示。
