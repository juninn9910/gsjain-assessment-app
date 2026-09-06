/* 교과학습발달상황 입력 도우미 — 나이스 그리드 조작
   실측으로 확인한 전제:
     - 학생 행: .cl-grid-row[data-rowindex]   (헤더 행에는 data-rowindex 없음)
     - 셀: 1=반/번호, 2=성명, 4=바이트 카운터, 7=입력칸
     - 선택된 행에만 <textarea>가 생성된다
     - 값은 "다른 행으로 선택이 옮겨갈 때" 확정된다. input 이벤트만으로는 유지되지 않는다
     - 바이트 카운터는 UTF-8 기준 (한글 3바이트). 실측 39/51 두 사례로 검증
     - change/keyup 이벤트는 프레임워크(cleopatra) 내부 예외를 유발하므로 보내지 않는다 */

(function () {
  "use strict";

  var NATIVE_SETTER = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype, "value").set;
  var ENCODER = new TextEncoder();

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function utf8Bytes(s) { return ENCODER.encode(s).length; }

  function realClick(el) {
    if (!el) return;
    var r = el.getBoundingClientRect();
    var o = {
      bubbles: true, cancelable: true, view: window,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
    };
    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(function (t) {
      try {
        var C = t.indexOf("pointer") === 0 ? PointerEvent : MouseEvent;
        el.dispatchEvent(new C(t, o));
      } catch (e) { /* 미지원 이벤트 무시 */ }
    });
  }

  function cellText(row, idx) {
    var c = row.querySelector('[data-cellindex="' + idx + '"] .cl-text');
    return c ? c.textContent.trim() : "";
  }
  function inputCell(row) { return row.querySelector('[data-cellindex="7"]'); }

  /* "39 / 1123 Byte" -> {used:39, max:1123} */
  function readCounter(row) {
    var m = cellText(row, 4).match(/(\d+)\s*\/\s*(\d+)/);
    return m ? { used: parseInt(m[1], 10), max: parseInt(m[2], 10) } : null;
  }

  function studentRows() {
    return [].slice.call(document.querySelectorAll(".cl-grid-row[data-rowindex]"))
      .filter(function (r) { return inputCell(r) && cellText(r, 2); });
  }

  function scan() {
    return studentRows().map(function (r) {
      var c = readCounter(r);
      return { num: cellText(r, 1), name: cellText(r, 2),
               used: c ? c.used : null, max: c ? c.max : null };
    });
  }

  /* 나이스 1번 셀은 "반/번호" 형식("2/1"). 앱은 번호만 넘기므로 뒷자리로 비교한다. */
  function rowNumber(row) {
    var t = cellText(row, 1);
    var parts = t.split("/");
    return parts[parts.length - 1].trim();
  }

  function findRow(rows, name, num) {
    var hit = rows.filter(function (r) { return cellText(r, 2) === name; });
    if (hit.length > 1) {
      if (!num) return null;                       /* 동명이인은 번호 없이 처리하지 않음 */
      var n = hit.filter(function (r) { return rowNumber(r) === String(num).trim(); });
      return n.length === 1 ? n[0] : null;
    }
    return hit.length === 1 ? hit[0] : null;
  }

  /* 선택을 target 이 아닌 다른 행으로 옮겨 target 의 입력값을 확정시킨다.
     팝업이 포커스를 가져가면 .blur() 가 실제 blur 이벤트를 못 내므로,
     프레임워크가 실제로 쓰는 "행 이동" 경로를 그대로 사용한다. */
  async function commitByLeaving(rows, target, wait) {
    var other = null;
    for (var i = 0; i < rows.length; i++) if (rows[i] !== target) { other = rows[i]; break; }
    if (!other) return;
    realClick(inputCell(other));
    await sleep(wait);
  }

  async function writeRow(row, text, wait) {
    realClick(inputCell(row));
    await sleep(wait);
    var ta = row.querySelector("textarea");
    if (!ta) return false;

    try { ta.focus(); } catch (e) {}
    NATIVE_SETTER.call(ta, text);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(Math.round(wait * 0.4));

    /* 포커스가 실제로 있을 때를 위한 경로 */
    try { ta.blur(); } catch (e) {}
    /* 포커스가 없을 때(팝업이 포커스를 쥔 경우)를 위한 경로 */
    try {
      ta.dispatchEvent(new FocusEvent("blur"));
      ta.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    } catch (e) {}
    await sleep(Math.round(wait * 0.4));
    return true;
  }

  async function fillAll(items, wait) {
    var rows = studentRows();
    if (!rows.length) {
      return { error: "학생 목록을 찾지 못했습니다. 교과학습발달상황 입력 화면인지 확인해 주세요." };
    }

    /* 첫 행이 이미 선택돼 있으면 클릭해도 선택 변경이 없어 값이 확정되지 않는다.
       시작 전에 선택을 마지막 행으로 옮겨 둔다. */
    realClick(inputCell(rows[rows.length - 1]));
    await sleep(wait);

    /* 1차: 대상 확정 */
    var targets = [], results = [];
    items.forEach(function (it) {
      var row = findRow(rows, it.name, it.num);
      if (!row) {
        results.push({ name: it.name, ok: false, msg: it.num ? "그리드에 없음" : "그리드에 없음 / 동명이인" });
        return;
      }
      var cap = readCounter(row), need = utf8Bytes(it.text);
      if (cap && need > cap.max) {
        results.push({ name: it.name, ok: false, msg: "한도 초과 " + need + " / " + cap.max + " Byte" });
        return;
      }
      targets.push({ item: it, row: row, need: need });
    });

    /* 2차: 순서대로 입력. 다음 행으로 넘어가는 동작이 앞 행을 확정시킨다 */
    for (var i = 0; i < targets.length; i++) {
      await writeRow(targets[i].row, targets[i].item.text, wait);
    }
    /* 마지막 행은 넘어갈 다음 행이 없으므로 따로 확정 */
    if (targets.length) await commitByLeaving(rows, targets[targets.length - 1].row, wait);

    /* 3차: 검증 + 실패분 1회 재시도 */
    for (var j = 0; j < targets.length; j++) {
      var t = targets[j], c = readCounter(t.row);
      if (!c || c.used === 0) {
        await writeRow(t.row, t.item.text, wait);
        await commitByLeaving(rows, t.row, wait);
        c = readCounter(t.row);
      }
      if (c && c.used > 0) {
        results.push({ name: t.item.name, ok: true, msg: c.used + " / " + c.max + " Byte" });
      } else {
        results.push({ name: t.item.name, ok: false, msg: "값이 반영되지 않음" });
      }
    }

    /* 입력 순서대로 정렬 */
    var order = {};
    items.forEach(function (it, i) { order[it.name] = i; });
    results.sort(function (a, b) { return order[a.name] - order[b.name]; });
    return { results: results };
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.type === "SCAN") { sendResponse({ rows: scan() }); return false; }
    if (msg.type === "FILL") { fillAll(msg.items, msg.wait || 450).then(sendResponse); return true; }
    return false;
  });
})();
