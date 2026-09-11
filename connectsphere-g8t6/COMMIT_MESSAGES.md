# Commit Message Standard Operating Procedure (SOP)

To ensure consistency, clarity, and traceability in the project's commit history, follow the guidelines outlined below when writing commit messages.

---

## **Structure of a Commit Message**

Each commit message should include two key parts:

1. **Header** (Required): A concise, one-line summary of the change.
   - Limit to 50 characters.
   - Use the imperative mood (e.g., "Fix bug," "Add feature").
2. **Body** (Required when making a Pull Request): A detailed explanation of the change.
   - Wrap text at 72 characters.
   - Explain **what** and **why** (avoid **how** unless necessary).

---

## **Commit Header Format**

```
[<project-prefix>][<type>] <summary>
```

### **Types**

- **FEAT**: Introducing a new feature.
- **FIX**: Fixing a bug.
- **DOCS**: Documentation updates.
- **STYLE**: Code style changes (formatting, missing semicolons, etc.) without affecting logic.
- **REFACTOR**: Code changes that neither fix a bug nor add a feature.
- **TEST**: Adding or modifying tests.
- **CHORE**: Maintenance tasks (e.g., dependency updates).
- **PERF**: Performance improvements.

### **Project Prefix**

- Use a consistent prefix for your project, such as "SR" (e.g., [SR]).

### **Summary**

- Use the imperative mood (e.g., "Add feature," "Fix issue").
- Avoid capitalizing beyond the first letter unless using proper nouns.
- Avoid punctuation at the end.

---

## **Examples**

### Simple Header:

```
[SR][FEAT] add Google OAuth support
```

### With Body:

```
[SR][FIX] resolve issue with dropdown alignment

The dropdown menu was misaligned on mobile devices due to incorrect flexbox settings. Adjusted the CSS to fix this issue.
```

---

## **Best Practices**

1. **Small Commits**: Commit only one logical change per commit.
2. **Atomic Changes**: Ensure each commit can be built and tested independently.
3. **Consistency**: Follow the format outlined above.
4. **Review Before Commit**: Verify your message for clarity and adherence to the SOP.

---

By adhering to these guidelines, the commit history will be clean, consistent, and easy to navigate, benefiting everyone involved in the project.
