/** @typedef {import("./library.js").Plan} Plan */
/** @typedef {{key:"createdAt"|"editedAt"|"lastPlayedAt",from:string,through:string}} DateRange */

/** @param {Plan} plan @param {string} key */
function recordDate(plan, key) {
  if (key === "createdAt") return plan.createdAt;
  if (key === "lastPlayedAt") return plan.lastPlayedAt;
  return plan.editedAt;
}

/** Select plans and their matching levels without changing authoritative records.
 * @param {Plan[]} plans @param {string} text @param {string} tags @param {DateRange[]} ranges @param {boolean} includeUnknown @param {string} sort
 */
export function searchLibrary(plans, text, tags, ranges, includeUnknown, sort) {
  const query = text.trim().toLocaleLowerCase();
  const required = tags
    .split("\n")
    .map((tag) => tag.trim().toLocaleLowerCase())
    .filter(Boolean);
  const results = plans.flatMap((plan) => {
    const datesMatch = ranges.every(({ key, from, through }) => {
      if (!from && !through) return true;
      if (from && through && from > through) return false;
      const date = recordDate(plan, key);
      if (!date) return includeUnknown;
      const day = new Date(date).toISOString().slice(0, 10);
      return (!from || day >= from) && (!through || day <= through);
    });
    if (!datesMatch) return [];
    const shared = [plan.name, plan.description, ...plan.tags]
      .join(" ")
      .toLocaleLowerCase();
    const levels = plan.levels.filter((level) => {
      const effectiveTags = [...plan.tags, ...level.tags].map((tag) =>
        tag.toLocaleLowerCase(),
      );
      return (
        required.every((tag) => effectiveTags.includes(tag)) &&
        [shared, level.name, level.description, ...level.tags]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query)
      );
    });
    return levels.length
      ? [{ plan, levels, filtered: Boolean(query || required.length) }]
      : [];
  });
  return results.sort((a, b) => {
    const byName =
      a.plan.name.localeCompare(b.plan.name) ||
      a.plan.id.localeCompare(b.plan.id);
    if (sort === "name") return byName;
    const key =
      sort === "createdAt" || sort === "lastPlayedAt" ? sort : "editedAt";
    const first = recordDate(a.plan, key),
      second = recordDate(b.plan, key);
    if (!first || !second) return first ? -1 : second ? 1 : byName;
    return Date.parse(second) - Date.parse(first) || byName;
  });
}
