You are helping the user optimize the performance of a specific part of the app.

## Workflow

1. **Ask for a recording**: Ask the user to do a Chrome DevTools performance recording (in Safari Web Inspector or Chrome) of the interaction they want to optimize. They should save the recording JSON file in the `recordings/` directory.

2. **Analyze the recording**: Run `just analyze recordings/<filename>.json` to get a breakdown of rendering frames, layout events, script events, and CPU profile hotspots.

3. **Identify bottlenecks**: Look at:
   - **Longest rendering frames** — anything over 16ms breaks 60fps
   - **Top script executions** — which events take the most time
   - **CPU self-time** — which functions are burning the most CPU (especially in `src/`)
   - **CPU total time** — which call trees are the most expensive

4. **Read the relevant source code**: Based on the CPU profile hotspots, read the source files to understand what the code is doing and why it's slow.

5. **Propose optimizations**: Present concrete, ranked optimization ideas to the user. Common patterns:
   - Caching/memoizing repeated computations
   - Replacing heavy library calls (e.g. date-fns) with lightweight arithmetic
   - Reducing algorithmic complexity (e.g. pre-indexing instead of O(n\*m) loops)
   - Avoiding unnecessary object allocations (especially Date objects)

6. **Let the user choose**: Don't implement anything until the user picks which optimizations to pursue.

7. **After implementing**: Ask the user to do another recording so you can compare before/after with `just analyze` and verify the improvements.
