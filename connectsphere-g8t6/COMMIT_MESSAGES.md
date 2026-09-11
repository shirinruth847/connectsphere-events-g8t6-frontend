# Commit Message Standard Operating Procedure (SOP)

To ensure consistency, clarity, and complete traceability across project boards and Git history, all contributors must follow the guidelines outlined below when writing commit messages.

---

## **1. Structure of a Commit Message**

Each commit message consists of up to three parts:

1. **Header** (_Required_): A concise, single-line summary containing developer name initials, ticket ID, type, and short description.
   - Limit to **50–72 characters**.
   - Use the imperative mood (e.g., "Add feature", "Fix issue" — not "Added" or "Fixes").
2. **Body** (_Required for PRs & complex changes_): Detailed context behind the change.
   - Wrap text at **72 characters**.
   - Focus on **what** was changed and **why** (avoid explaining _how_ unless necessary).
3. **Footer** (_Optional_): References to issue tracking tickets, breaking changes, or co-authors.

---

## **2. Commit Header Format**

```text
[<name-prefix>][<ticket-id>][<type>] <summary>
```

### **Format Breakdown**

| Field             | Description                                                                                  | Example                             |
| :---------------- | :------------------------------------------------------------------------------------------- | :---------------------------------- |
| **`name-prefix`** | The contributor's initials or identifier (in uppercase).                                     | `JD` (John Doe), `AS` (Alice Smith) |
| **`ticket-id`**   | The issue tracker ID associated with the task/bug. Use `NO-TICKET` for quick chores or docs. | `SPM-54`, `SPM-58`                  |
| **`type`**        | The category describing the nature of the change (all caps).                                 | `FEAT`, `FIX`                       |
| **`summary`**     | Concise summary starting with an imperative verb.                                            | `add Google OAuth support`          |

---

## **3. Commit Types**

| Type           | When to Use                                                                |
| :------------- | :------------------------------------------------------------------------- |
| **`FEAT`**     | Introducing a new feature or functionality.                                |
| **`FIX`**      | Resolving a bug or error.                                                  |
| **`DOCS`**     | Adding or updating documentation (e.g., `README.md`, inline code docs).    |
| **`STYLE`**    | Code style changes (formatting, missing semicolons) with no logic changes. |
| **`REFACTOR`** | Restructuring code without fixing a bug or adding a feature.               |
| **`TEST`**     | Adding, updating, or fixing test cases.                                    |
| **`CHORE`**    | Maintenance tasks (dependency updates, build scripts, tool configuration). |
| **`PERF`**     | Performance optimization changes.                                          |

---

## **4. Examples**

### **Feature Commit (With Ticket ID)**

```text
[SR][SPM-54][FEAT] initialize React boilerplate application
```

### **Bug Fix Commit (With Ticket ID)**

```text
[AS][SPM-58][FIX] resolve API connection CORS error between frontend and backend
```

### **Documentation Update (No Specific Ticket)**

```text
[JD][NO-TICKET][DOCS] update README with branching strategy and SOP
```

### **Full Commit (Header + Body + Footer)**

```text
[JD][SPM-58][FIX] resolve CORS misconfiguration on proxy setup

The API proxy route in the frontend server was omitting credentials headers,
causing local development requests to fail across ports 3000 and 5000.

Closes SPM-58
```

---

## **5. Standard Operating Guidelines & Rules**

1. **Include Name Initials & Ticket IDs**: Always attach your name prefix (e.g., `[JD]`) and valid issue key (e.g., `[SPM-54]`) for author recognition and board traceability.
2. **Atomic Commits**: Keep commits small and focused on a single logical change. Do not bundle unrelated changes together.
3. **Imperative Mood**: Write the summary as a command (e.g., "Add component" instead of "Added component").
4. **Pre-Commit Self-Review**: Run `git diff` and check your commit message format before executing `git commit`.

---

This SOP is strictly enforced for all pull requests merged into `main`.
