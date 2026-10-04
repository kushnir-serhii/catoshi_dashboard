---
name: component-structure
description: Project rules for React / React Native component files — one component per file, domain folders, reuse before creating, data-driven rendering. Use whenever creating, editing, splitting or planning UI components.
---

# Component structure rules

1. **One component per file.** The file name equals the component name (`PriceBadge.tsx`). Tiny helpers that are used only by that component and have no JSX may stay in the file. A second JSX component gets its own file.
2. **Folders by group.** Use `components/<group>/<Name>.tsx`, or `components/<group>/<Name>/` when the component has its own sub-parts, hook or styles. Each group gets an `index.ts` barrel that re-exports its public components. Groups are domains (`dashboard`, `charts`, `forms`, `ui`, `layout`), not file types.
3. **Reuse before creating.** Check `context/components-index.md` first (regenerate it with `node .awos-tune/scripts/component-index.mjs`). If an existing component differs only in style or content, add a prop or variant (`variant`, `size`, `tone`, `children`, render slots) instead of copying it. **Do not duplicate Tailwind class strings**: if the same class set appears twice, it becomes a component or a variant.
4. **Data-driven rendering.** Three or more elements with the same structure are rendered from an array: `items.map(item => <Card key={item.id} {...item} />)`. Keep the array in `consts/` when it is static or shared.
5. **Splitting large files.** When you touch a file that already holds several components, do not add another one to it. If the task allows it, extract the component you are working on into its own file and leave the rest as it is.

The project hook (`.awos-tune/hooks/check-components.mjs`) blocks writes that add a component to a file which already contains one. The escape hatch is the comment `// awos-tune: allow-multiple-components`, and only the user may authorise it.
