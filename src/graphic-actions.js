"use strict";
function text(value, max, label) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > max ||
    /[<>\x00-\x1f]/.test(value)
  )
    throw new Error(`${label}: enter plain text, up to ${max} characters.`);
  return value.trim();
}
function graphicPatch(kind, input, now = Date.now()) {
  if (kind === "hide-banner") return { banner: { type: "", ts: 0 } };
  if (kind === "banner") {
    if (
      ![
        "ace",
        "teamace",
        "clutch",
        "flawless",
        "thrifty",
        "matchpoint",
        "overtime",
        "custom",
      ].includes(input?.type)
    )
      throw new Error("Choose a supported banner.");
    if (
      !Number.isInteger(input.team) ||
      input.team < 0 ||
      input.team > 1 ||
      !Number.isInteger(input.player) ||
      input.player < 0 ||
      input.player > 4
    )
      throw new Error("Choose a team and player slot.");
    const headline =
      input.type === "custom"
        ? text(input.headline, 100, "Headline")
        : input.type === "clutch"
          ? String(input.clutchSize || "")
          : "";
    if (input.type === "clutch" && !["2", "3", "4", "5"].includes(headline))
      throw new Error("Choose a clutch against two to five players.");
    return {
      banner: {
        type: input.type,
        team: input.team,
        player: input.player,
        text: headline,
        method:
          input.type === "custom" && input.subline
            ? text(input.subline, 160, "Subline")
            : "",
        ts: now,
        hold: 4200,
      },
    };
  }
  if (kind === "toast")
    return { toast: { text: text(input?.text, 180, "Update"), ts: now } };
  if (kind === "poll") {
    const question = text(input?.question, 120, "Question"),
      options = input?.options;
    if (!Array.isArray(options) || options.length !== 2)
      throw new Error("Enter two poll options.");
    const first = Number(input?.firstPercent);
    if (!Number.isInteger(first) || first < 0 || first > 100)
      throw new Error("Use a whole percentage from 0 to 100.");
    const labels = options.map((option) => text(option, 40, "Option"));
    if (labels[0].toLowerCase() === labels[1].toLowerCase())
      throw new Error("Poll options must differ.");
    return {
      poll: {
        question,
        options: [
          { label: labels[0], pct: first },
          { label: labels[1], pct: 100 - first },
        ],
        votes: 0,
      },
      show: { poll: true },
    };
  }
  if (kind === "hide-poll") return { show: { poll: false } };
  throw new Error("Choose an available graphic action.");
}
module.exports = { graphicPatch };
