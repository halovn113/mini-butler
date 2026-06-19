1. **Analyze:** We need to find ONE performance optimization in the codebase that's small (<50 lines), effective, safe, and doesn't affect architecture or dependencies. We've investigated several things:
  - `_probe_services` in `src/butler/interface/live_ui.py`: It's already using `asyncio.gather` for checking services concurrently.
  - `sqlite_store` and other db classes doing `SELECT COUNT(*)` where they shouldn't: They seem to be counting actual rows needed for stats (not just existence checks where `LIMIT 1` is better).
  - `src/butler/vision/spatial_cache.py`: LRU eviction uses `SELECT COUNT(*)`, which could be slow.
  - `src/butler/agent/app_detector.py` `_proc_running_apps`: The code was updated to use `os.scandir` instead of `os.listdir`, which is already good.
  - `src/butler/tools/news.py`: Contains a classic N+1 API call problem in `_fetch_hn` (Hacker News) where it loops over IDs and makes sequential `await client.get(...)` calls.

2. **The Discovery in `news.py`:**
   In `src/butler/tools/news.py`, around line 148:
   ```python
   for story_id in ids:
       item_resp = await client.get(
           f"https://hacker-news.firebaseio.com/v0/item/{story_id}.json",
           timeout=TIMEOUT,
       )
   ```
   This does sequential fetches for Hacker News items. We created a test script that proves doing these concurrently using `asyncio.gather` cuts fetch time significantly.

3. **The Fix:**
   Modify `_fetch_hn` in `src/butler/tools/news.py` to fetch stories concurrently using `asyncio.gather`.
   We will keep it clean and robust, handling exceptions per request (via `return_exceptions=True` or a try-except block inside the helper).
   This solves an N+1 API call bottleneck, fitting the criteria perfectly.

4. **Plan:**
   - **Step 1:** Modify `src/butler/tools/news.py` to use `asyncio.gather` to fetch Hacker News items concurrently, rather than sequentially. Add a comment explaining the performance optimization.
   - **Step 2:** Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done. This includes running the full test suite and linting.
   - **Step 3:** Commit and submit the code as a PR with the required `⚡ Bolt: [performance improvement]` title and description format.
