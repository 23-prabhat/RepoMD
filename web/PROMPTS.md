
# Project RepoMD – Prompts

## Landing Page

need a landing page for repomd — its a tool where you paste a github url and it gives you an analysis of that repo

- font should be Bricolage Grotesque for headings, looks more techy
- dark mode by default, accent color #39ff14 (neon green), light mode accent #16a34a
- main thing on the page is just an input box where you paste the repo url
- below that add cards for each module we built — M1, M2, M3, B1, B2, B3 — just a short description of what each one does

---

## Analysis / Results Page

need a separate page that shows everything after the repo gets analyzed

the analysis has a bunch of sections — folder structure, entry points, dependency map, critical files, execution flow, repo summary — so lay them out as separate sections, don't dump it all in one block. dark themed, keep it consistent with the landing page

---

## Dependencies Graph

the dependency map was showing as a plain list which was hard to read. want to replace it with an actual interactive graph — nodes for files, edges showing which file depends on which. something you can zoom and drag around

---

## Day & Night Mode

add a light/dark mode toggle, landing page is dark by default but some people prefer light. just make sure the colors still work in both modes, the neon green accent is dark mode only so swap it for the darker green in light mode

---

## Chatbot

add a chat feature on the results page so users can ask questions about the repo after its been analyzed. something like "what does this file do" or "how does auth work here"


---
##  Backend logic

build the analyze endpoint for a github repo intelligence tool in src/app/api

  flow is: user pastes a github url -> we fetch the repo -> pick the most
  useful files -> dump everything into gemini -> get back structured analysis

  github api plan:
  - first hit /repos/{owner}/{repo} for metadata (language, stars, default branch)
  - then /git/trees/{branch}?recursive=1 to get the full file list in one shot
    (the recursive flag is key, otherwise we'd have to walk directories manually)
  - then /contents/{path} for actual file bodies — base64 encoded, need to decode


  ## Architecture Graph
                                                                                                                                 
  the execution flow section was just a numbered list of steps which is kind of hard to read. want to turn it into a proper
  layered graph — group files by their layer (like route, middleware, db, etc.) and show arrows between them following the       
  execution order 

  use reactflow for this. layout should be top-down using dagre so the layers stack vertically. each layer gets a header node
  with a colored accent bar on the left, and the files in that layer sit below it as card nodes

  the file nodes should show the filename, full path below it, and if the file is in criticalFiles then show a small category
  badge (auth, database, api, etc.) with its own color

  hover on a node should highlight it and its direct neighbors, everything else dims out. edges between files should be animated
  dashed lines

  throw in a minimap and zoom controls, and a small legend panel top-right showing which color maps to which layer


