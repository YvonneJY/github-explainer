#!/usr/bin/env node
/**
 * fetch-repo.js
 * 获取GitHub仓库信息，返回JSON格式
 *
 * 用法: node fetch-repo.js <owner> <repo>
 */

const https = require('https');

const GITHUB_API = 'api.github.com';
const ACCEPT_HEADER = 'application/vnd.github.v3+json';
const MAX_DEPTH = 3; // 最大递归深度
const MAX_FILES = 50; // 最大文件数量

function fetchJson(url, token = null) {
  return new Promise((resolve, reject) => {
    const headers = {
      'Accept': ACCEPT_HEADER,
      'User-Agent': 'github-explainer-skill'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = https.get(url, { headers }, (res) => {
      // 检查rate limit
      if (res.headers['x-ratelimit-remaining'] === '0') {
        reject(new Error(`GitHub API rate limit exceeded. Resets at ${new Date(parseInt(res.headers['x-ratelimit-reset']) * 1000)}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ json: JSON.parse(data), headers: res.headers });
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function decodeBase64(content) {
  return Buffer.from(content, 'base64').toString('utf-8');
}

// 递归获取目录结构
async function getDirectoryStructure(owner, repo, path = '', depth = 0, fileCount = { count: 0 }) {
  if (depth > MAX_DEPTH || fileCount.count >= MAX_FILES) {
    return [];
  }

  try {
    const { json } = await fetchJson(`https://${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`);
    const items = Array.isArray(json) ? json : [json];

    const result = [];

    for (const item of items) {
      if (fileCount.count >= MAX_FILES) break;

      const entry = {
        name: item.name,
        path: item.path,
        type: item.type
      };

      if (item.type === 'file') {
        entry.size = item.size;
        fileCount.count++;
      }

      result.push(entry);

      // 递归获取子目录
      if (item.type === 'dir' && depth < MAX_DEPTH) {
        entry.children = await getDirectoryStructure(owner, repo, item.path, depth + 1, fileCount);
      }
    }

    return result;
  } catch (e) {
    console.error(`Failed to get contents for ${path}:`, e.message);
    return [];
  }
}

// 获取文件内容摘要
async function getSourceFilePreview(owner, repo, path) {
  try {
    const { json } = await fetchJson(`https://${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`);

    if (json.size > 50000) { // 跳过大于50KB的文件
      return {
        path: path,
        content: '[文件过大，已省略]',
        size: json.size
      };
    }

    const content = decodeBase64(json.content);
    // 只取前2000字符
    const preview = content.slice(0, 2000);

    return {
      path: path,
      content: preview,
      size: json.size
    };
  } catch (e) {
    return {
      path: path,
      content: `[获取失败: ${e.message}]`,
      size: 0
    };
  }
}

// 判断是否为源代码文件
function isSourceFile(name) {
  const sourceExtensions = [
    '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs',
    '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.swift', '.kt',
    '.php', '.rb', '.ex', '.exs', '.vue', '.svelte',
    '.html', '.css', '.scss', '.sass', '.less',
    '.json', '.yaml', '.yml', '.toml', '.xml',
    '.md', '.txt', '.sql',
    '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd'
  ];

  const sourceNames = [
    'Makefile', 'Dockerfile', 'Vagrantfile', 'Gemfile', 'Rakefile',
    'package.json', 'setup.py', 'requirements.txt', 'Cargo.toml',
    'go.mod', 'go.sum', 'go.work', 'pyproject.toml', 'Pipfile'
  ];

  const ext = name.slice(name.lastIndexOf('.'));
  return sourceExtensions.includes(ext) || sourceNames.includes(name);
}

// 判断是否为忽略的文件/目录
function shouldIgnore(name, path) {
  const ignorePatterns = [
    'node_modules', '.git', '__pycache__', '.next', 'dist', 'build',
    '.cache', '.temp', '.tmp', 'vendor', 'venv', '.venv',
    '.idea', '.vscode', '.editorconfig',
    'coverage', '.nyc_output', '.parcel-cache',
    '.pytest_cache', '.mypy_cache', '.tox'
  ];

  const fullPath = path + '/' + name;

  for (const pattern of ignorePatterns) {
    if (name === pattern || fullPath.includes(pattern)) {
      return true;
    }
  }

  // 忽略隐藏文件（但保留 .gitignore 等配置）
  if (name.startsWith('.') && !['.gitignore', '.env.example', '.env.template'].includes(name)) {
    return true;
  }

  return false;
}

// 扁平化目录结构为文件列表
function flattenStructure(items, result = []) {
  for (const item of items) {
    if (shouldIgnore(item.name, item.path)) continue;

    if (item.type === 'file') {
      result.push(item);
    } else if (item.children) {
      flattenStructure(item.children, result);
    }
  }
  return result;
}

// 生成树形结构字符串
function formatTree(items, prefix = '', isLast = true) {
  let result = [];
  const connector = isLast ? '└── ' : '├── ';
  const newPrefix = prefix + (isLast ? '    ' : '│   ');

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isItemLast = i === items.length - 1;
    const icon = item.type === 'dir' ? '📁' : '📄';
    const size = item.size ? ` (${formatSize(item.size)})` : '';

    result.push(`${prefix}${isItemLast ? '└── ' : '├── '}${icon} ${item.name}${size}`);

    if (item.children) {
      result = result.concat(formatTree(item.children, newPrefix, isItemLast));
    }
  }

  return result;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

async function getRepoInfo(owner, repo) {
  console.error('Fetching repo info...');

  // 1. 获取仓库基本信息
  const { json: repoData } = await fetchJson(`https://${GITHUB_API}/repos/${owner}/${repo}`);

  // 2. 获取README
  let readme = '';
  try {
    const { json: readmeData } = await fetchJson(`https://${GITHUB_API}/repos/${owner}/${repo}/readme`);
    readme = decodeBase64(readmeData.content);
    readme = readme.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').replace(/\*/g, '');
  } catch (e) {
    console.error('README fetch failed:', e.message);
  }

  // 3. 获取目录结构
  console.error('Fetching directory structure...');
  const structure = await getDirectoryStructure(owner, repo);

  // 4. 扁平化并筛选源文件
  const allFiles = flattenStructure(structure);
  const sourceFiles = allFiles.filter(f => isSourceFile(f.name)).slice(0, 20);

  // 5. 获取源文件内容预览
  console.error(`Fetching previews for ${sourceFiles.length} source files...`);
  const sourceFilePreviews = [];
  for (const file of sourceFiles) {
    const preview = await getSourceFilePreview(owner, repo, file.path);
    sourceFilePreviews.push(preview);
  }

  // 6. 尝试获取package.json
  let packageJson = null;
  try {
    const { json: pkgData } = await fetchJson(`https://${GITHUB_API}/repos/${owner}/${repo}/contents/package.json`);
    const pkgContent = decodeBase64(pkgData.content);
    packageJson = JSON.parse(pkgContent);
  } catch (e) {
    // package.json不存在是正常的
  }

  // 7. 尝试获取requirements.txt
  let requirements = [];
  try {
    const { json: reqData } = await fetchJson(`https://${GITHUB_API}/repos/${owner}/${repo}/contents/requirements.txt`);
    const reqContent = decodeBase64(reqData.content);
    requirements = reqContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  } catch (e) {
    // requirements.txt不存在是正常的
  }

  // 8. 获取配置文件列表
  const configFiles = allFiles
    .filter(item => {
      const name = item.name.toLowerCase();
      return name === '.env.example' ||
             name === '.env.template' ||
             name === 'config' ||
             name === 'settings' ||
             name === 'tsconfig.json' ||
             name === 'pyproject.toml' ||
             name === 'cargo.toml' ||
             name === 'go.mod' ||
             name.endsWith('.config.js') ||
             name.endsWith('.config.ts') ||
             name.endsWith('.config.json');
    })
    .map(item => item.name);

  // 组合结果
  const result = {
    name: repoData.name,
    owner: repoData.owner.login,
    repo: repoData.name,
    url: repoData.html_url,
    description: repoData.description || '',
    language: repoData.language || 'Unknown',
    stars: repoData.stargazers_count,
    forks: repoData.forks_count,
    topics: repoData.topics || [],
    homepage: repoData.homepage || '',
    readme: readme,
    structure: structure,
    structureTree: formatTree(structure).join('\n'),
    packageJson: packageJson,
    requirements: requirements,
    configFiles: configFiles,
    sourceFiles: sourceFilePreviews,
    license: repoData.license ? repoData.license.name : null,
    updatedAt: repoData.updated_at,
    createdAt: repoData.created_at,
  };

  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('用法: node fetch-repo.js <owner> <repo>');
    console.error('例如: node fetch-repo.js facebook react');
    process.exit(1);
  }

  const [owner, repo] = args;

  try {
    await getRepoInfo(owner, repo);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();
