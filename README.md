# GitHub Explainer

把GitHub项目用大白话解释清楚，生成精美的HTML报告。

## 功能

输入任意GitHub仓库URL，获得一份包含以下内容的完整HTML报告：

1. **项目概览** - 名称、star数、技术栈、一句话解释
2. **生活比喻** - 用日常生活的例子解释项目是做什么的
3. **整体结构** - 树形目录图 + 结构逻辑说明
4. **模块解读** - 每个核心模块的作用和依赖关系
5. **数据流向** - 模块间的交互关系，ASCII流程图
6. **快速上手** - 安装、配置、运行命令
7. **使用指南** - 面向不同用户角色的教程

## 使用方法

在Claude Code中，直接输入GitHub仓库URL：

```
解释一下 https://github.com/facebook/react
```

或者

```
帮我看看 owner/repo 这个项目是干嘛的
```

## 预览

查看 [examples/sample-report.html](examples/sample-report.html) 了解生成的报告样式。

## 技术细节

- **数据获取**：直接调用GitHub API，无需API Key（匿名60次/小时）
- **报告格式**：单HTML文件，内联CSS，可离线查看
- **响应式设计**：支持手机和电脑

## 文件结构

```
github-explainer/
├── SKILL.md                      # Skill入口定义
├── prompts/
│   └── generate-report.md        # HTML生成prompt
├── scripts/
│   ├── fetch-repo.js            # GitHub API获取脚本
│   └── package.json
└── examples/
    └── sample-report.html        # 示例报告
```
