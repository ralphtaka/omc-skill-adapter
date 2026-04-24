# omc-skill-adapter

把外部 Claude Code skill 套件自動橋接進 [oh-my-claudecode (OMC)](https://github.com/yeachan-heo/oh-my-claudecode) 的 skill loader，不需改動任何一方的程式碼。

## 它解決什麼問題

OMC 有自己的 skill loader，掃 `~/.omc/skills/` 並在 session 啟動時將相關 skill 注入 context。但外部 skill 套件（如 [addy-agent-skills](https://github.com/addyosmani/agent-skills)）使用不同的 frontmatter schema，存放在不同目錄，OMC 完全看不到。

`omc-skill-adapter` 在每次 session 啟動時將外部 skill 轉成 OMC 格式、寫入 `~/.omc/skills/`。外部套件升版 → 下次 session 自動重建。套件被移除 → 對應 skill 自動清理。

**任何一方都不需要修改**：不改 OMC、不改外部套件、不動你既有的 `~/.omc/skills/` 內容。

---

## 從零開始：完整安裝流程

### 步驟一：安裝 Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
```

> 需要 Node.js ≥ 18.17。驗證：`claude --version`

### 步驟二：安裝 oh-my-claudecode (OMC)

```bash
claude plugin install https://github.com/yeachan-heo/oh-my-claudecode
```

安裝後開一個新 session 確認 OMC hooks 正常：

```bash
claude
# 應該看到 OMC SessionStart 的相關訊息
```

### 步驟三：安裝外部 skill 套件（以 addy-agent-skills 為例）

```bash
claude plugin install https://github.com/addyosmani/agent-skills
```

安裝後雖然可以用 `/agent-skills:spec` 這類指令叫用 skill，但 OMC 的 skill-injector（關鍵字自動注入）和 `list_omc_skills` 還看不到它們。

### 步驟四：安裝 omc-skill-adapter

**方法 A：Claude Code plugin（推薦）**

```bash
claude plugin install https://github.com/<user>/omc-skill-adapter
```

安裝完成後，plugin 會自動在 `settings.json` 裡註冊 SessionStart hook。

**方法 B：手動安裝**

```bash
git clone https://github.com/<user>/omc-skill-adapter
cd omc-skill-adapter
npm install
./scripts/install.sh
```

腳本會：
1. 打包成單檔 bundle 放到 `~/.local/share/omc-skill-adapter/dist/`
2. 複製預設設定到 `~/.omc/skill-sources.yaml`
3. 複製 trigger 檔到 `~/.omc/skill-triggers/`
4. 在 `~/.claude/settings.json` 加入 SessionStart hook
5. 執行第一次 sync

### 步驟五：設定 skill sources

編輯 `~/.omc/skill-sources.yaml`（安裝時已自動建立預設版本）：

```yaml
version: 1
sources:
  - name: addy-agent-skills
    glob: "~/.claude/plugins/cache/addy-agent-skills/**/skills/*/SKILL.md"
    prefix: addy
    triggers: triggers/addy-agent-skills.yaml
    enabled: true
```

儲存後，開新 session，OMC 就能看到 `addy-*` 系列的 skill 了。

### 步驟六：驗證

```bash
# 手動跑一次 sync 看輸出
omc-skill-adapter sync --config ~/.omc/skill-sources.yaml

# 查看狀態
omc-skill-adapter status

# 確認 skill 已寫入
ls ~/.omc/skills/ | grep "addy-"
```

在 Claude Code session 裡可以用 MCP tool 驗證：

```
list_omc_skills  → 應看到 addy-spec-driven-development 等條目
```

---

## 日常使用

安裝完成後完全自動，不需要任何手動操作：

- **開 session**：SessionStart hook 自動跑 `sync --quiet`
- **外部套件升版**：下次 session 偵測到 fingerprint 變化，自動重建
- **外部套件被移除**：下次 session 自動清除對應 skill
- **加新 source**：編輯 `~/.omc/skill-sources.yaml`，下次 session 生效

---

## CLI 指令

```bash
# 同步所有 source（session 啟動時自動執行）
omc-skill-adapter sync

# 預覽變更，不實際寫入
omc-skill-adapter sync --dry-run

# 強制完整重建（忽略 fingerprint cache）
omc-skill-adapter sync --force

# 安靜模式（只輸出錯誤）
omc-skill-adapter sync --quiet

# 只清除孤兒 skill，不 sync
omc-skill-adapter prune

# 查看各 source 狀態與 fingerprint cache
omc-skill-adapter status
```

---

## 設定說明

### `~/.omc/skill-sources.yaml`

```yaml
version: 1
sources:
  - name: addy-agent-skills          # source 名稱（用於 fingerprint 和 log）
    glob: "~/.claude/plugins/cache/addy-agent-skills/**/skills/*/SKILL.md"
    prefix: addy                     # 產出 skill id 的前綴（避免命名衝突）
    triggers: triggers/addy-agent-skills.yaml  # trigger 關鍵字對應表
    enabled: true                    # false 則停用並清除已產出的 skill

  # 可加更多 source：
  # - name: superpowers
  #   glob: "~/.claude/plugins/cache/superpowers-dev/**/skills/*/SKILL.md"
  #   prefix: sp
  #   triggers: triggers/superpowers.yaml
  #   enabled: true
```

### Trigger 關鍵字設定（`~/.omc/skill-triggers/<source>.yaml`）

OMC 的 skill-injector 在每次 prompt 送出時比對 trigger 關鍵字，命中則自動把該 skill 內容注入 context。Trigger 設定範例：

```yaml
spec-driven-development:
  - spec
  - specification
  - requirements
  - write a spec

test-driven-development:
  - tdd
  - test driven
  - write tests first
  - failing test
```

預設 trigger 檔（`addy-agent-skills.yaml`）已內建 21 個 skill 的關鍵字，可直接使用或依需求調整。

---

## 加入新 source

1. 在 `~/.omc/skill-sources.yaml` 加一個新 entry
2. 建立對應的 trigger 檔（`~/.omc/skill-triggers/<source-name>.yaml`）
3. 開新 session 或執行 `omc-skill-adapter sync`

---

## 它如何運作

```
外部 skill 套件 (唯讀，由 plugin 管理)
  └── skills/*/SKILL.md  (只有 name + description)
          │
          ▼ read
  omc-skill-adapter
  ├── 設定：~/.omc/skill-sources.yaml
  ├── Triggers：~/.omc/skill-triggers/
  └── Fingerprint cache：~/.omc/.skill-adapter/
          │
          ▼ write（只在偵測到變化時）
  ~/.omc/skills/<prefix>-<name>/SKILL.md  (OMC 格式)
          │
          ▼ read（OMC 原生機制，零改動）
  OMC skill loader / skill-injector / list_omc_skills
```

**Fingerprint 機制**：每次 sync 計算 source 目錄下所有 SKILL.md 的 mtime + size hash，與上次儲存的 hash 比對。相符則 <50ms 快速退出；不符則重建該 source。

**安全清理**：每個產出檔的 frontmatter 都嵌有 `adapter_source` marker。只有帶這個 marker 的 skill 才會被本工具刪除 — 你手寫的 skill、OMC 自己的 skill、其他工具的 skill 一律不動。

---

## 系統需求

| 需求 | 版本 |
|------|------|
| Node.js | ≥ 18.17（Claude Code 本身已要求） |
| Claude Code | 最新版 |
| oh-my-claudecode | 已安裝 |
| 外部 skill 套件 | 任何符合 Anthropic 標準 frontmatter 的套件 |

**運行時零外部依賴**：bundle 是單一 `.mjs` 檔，使用 Node.js 內建 API（`fs`、`crypto`、`path`），無需 `npm install`。

---

## 授權

MIT
