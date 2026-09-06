"use strict";

var $ = function (id) { return document.getElementById(id); };
var parsed = null;

/* 나이스 카운터는 UTF-8 기준 (한글 3바이트). 실측으로 확인함 */
var ENCODER = new TextEncoder();
function utf8Bytes(s) { return ENCODER.encode(s).length; }

function say(html, cls) {
  $("out").innerHTML = '<div class="msg ' + (cls || "") + '">' + html + "</div>";
}

function table(rows) {
  return "<table>" + rows.join("") + "</table>";
}

function send(msg) {
  return new Promise(function (resolve) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs.length) return resolve({ error: "탭을 찾지 못했습니다." });
      chrome.tabs.sendMessage(tabs[0].id, msg, function (res) {
        if (chrome.runtime.lastError) {
          return resolve({ error: "나이스 화면에서 열어 주세요. (페이지 새로고침 후 재시도)" });
        }
        resolve(res || { error: "응답이 없습니다." });
      });
    });
  });
}

/* 붙여넣은 JSON 검사 + 그리드와 대조 */
$("check").addEventListener("click", async function () {
  parsed = null;
  $("fill").disabled = true;

  var raw = $("json").value.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  if (!raw) return say("JSON을 붙여넣어 주세요.", "bad");

  var data;
  try { data = JSON.parse(raw); }
  catch (e) { return say("JSON 형식 오류: " + e.message, "bad"); }
  if (!Array.isArray(data)) return say("최상위가 배열([...])이어야 합니다.", "bad");

  var items = [];
  for (var i = 0; i < data.length; i++) {
    var d = data[i];
    if (!d || typeof d.name !== "string" || typeof d.text !== "string" || !d.name.trim() || !d.text.trim()) {
      return say((i + 1) + "번째 항목에 name 또는 text가 없습니다.", "bad");
    }
    items.push({ name: d.name.trim(), num: d.num ? String(d.num).trim() : null, text: d.text });
  }

  var res = await send({ type: "SCAN" });
  if (res.error) return say(res.error, "bad");

  var grid = res.rows || [];
  if (!grid.length) return say("화면에서 학생 목록을 찾지 못했습니다.<br>교과학습발달상황 입력 화면인지 확인해 주세요.", "bad");

  var byName = {};
  grid.forEach(function (g) { byName[g.name] = (byName[g.name] || 0) + 1; });

  var lines = [], okCount = 0;
  items.forEach(function (it) {
    var need = utf8Bytes(it.text), g = null, note = "", cls = "ok", mark = "○";
    for (var k = 0; k < grid.length; k++) if (grid[k].name === it.name) { g = grid[k]; break; }

    if (!g) { mark = "✕"; cls = "bad"; note = "그리드에 없음"; }
    else if (byName[it.name] > 1 && !it.num) { mark = "✕"; cls = "bad"; note = "동명이인 — num 필요"; }
    else if (g.max && need > g.max) { mark = "✕"; cls = "bad"; note = "한도 초과 " + need + " / " + g.max; }
    else { okCount++; note = need + " / " + (g.max || "?") + " Byte"; if (g.used > 0) note += " · 기존 내용 있음"; }

    lines.push('<tr><td class="s ' + cls + '">' + mark + '</td><td class="n">' +
      it.name + '</td><td class="' + cls + '">' + note + "</td></tr>");
  });

  var head = "<b>" + items.length + "명 중 " + okCount + "명 입력 가능</b>" +
    (okCount < items.length ? ' <span class="bad">(✕ 표시는 건너뜁니다)</span>' : "");
  $("out").innerHTML = '<div class="msg">' + head + "</div>" + table(lines);

  parsed = items;
  $("fill").disabled = okCount === 0;
});

/* 실제 입력 */
$("fill").addEventListener("click", async function () {
  if (!parsed) return;
  $("fill").disabled = true;
  $("check").disabled = true;
  say("입력 중… 나이스 화면을 건드리지 마세요.");

  var res = await send({ type: "FILL", items: parsed, wait: parseInt($("speed").value, 10) });

  $("check").disabled = false;
  if (res.error) { $("fill").disabled = false; return say(res.error, "bad"); }

  var ok = 0;
  var lines = (res.results || []).map(function (r) {
    if (r.ok) ok++;
    return '<tr><td class="s ' + (r.ok ? "ok" : "bad") + '">' + (r.ok ? "✓" : "✕") +
      '</td><td class="n">' + r.name + '</td><td class="' + (r.ok ? "ok" : "bad") + '">' + r.msg + "</td></tr>";
  });

  var head = "<b>" + ok + " / " + (res.results || []).length + "명 입력 완료</b>";
  if (ok > 0) head += '<br><span class="ok">화면에서 내용을 확인하신 뒤 <b>저장</b>을 눌러 주세요.</span>';
  $("out").innerHTML = '<div class="msg">' + head + "</div>" + table(lines);
  $("fill").disabled = false;
});
