/* ============================
   CONFIG
   ============================ */
var API_ENDPOINT = "https://anthropic-proxy-virid.vercel.app/api/claude";
var AI_MODEL = "claude-sonnet-5";
var APP_PASSWORD = "1011";

/* ============================
   UTILS
   ============================ */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

/* UTF-8 기준 바이트 계산 (한글 3바이트, 영문/숫자 1바이트).
   나이스 입력 화면의 "n / m Byte" 카운터가 UTF-8 기준임을 실측으로 확인했다.
   (예: "자동입력 테스트 문장입니다." -> 나이스 39, UTF-8 39, EUC-KR 27) */
var BYTE_ENCODER = new TextEncoder();

/* 프록시 문지기 토큰. Vercel 의 APP_TOKEN 과 같은 값이어야 한다.
   사용자에게 입력받지 않는다 - 선생님은 설정 없이 바로 쓸 수 있어야 한다.
   유출되면 Vercel APP_TOKEN 과 이 값을 함께 바꾸고 재배포하면 된다. */
var APP_TOKEN = "nB_986AEv-o28ubOlm-YaODWnvySOSbi";
function countBytes(s) {
  if (!s) return 0;
  return BYTE_ENCODER.encode(s).length;
}
function loadJSON(key, fallback) {
  try {
    var d = localStorage.getItem(key);
    return d ? JSON.parse(d) : fallback;
  } catch (e) {
    return fallback;
  }
}
function saveJSON(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

/* ============================
   APP
   ============================ */
var useState = React.useState;
var useEffect = React.useEffect;
var useCallback = React.useCallback;
var useRef = React.useRef;
function App() {
  var _auth = useState(false);
  var authed = _auth[0],
    setAuthed = _auth[1];
  var _ts = useState(function () {
    return loadJSON("pca_teachers", []);
  });
  var teachers = _ts[0],
    setTeachers = _ts[1];
  var _tid = useState(null);
  var teacherId = _tid[0],
    setTeacherId = _tid[1];
  var _page = useState("home");
  var page = _page[0],
    setPage = _page[1];
  var _toast = useState([]);
  var toasts = _toast[0],
    setToasts = _toast[1];
  var _modal = useState(null);
  var modal = _modal[0],
    setModal = _modal[1];
  function toast(msg) {
    var id = uid();
    setToasts(function (prev) {
      return prev.concat([{
        id: id,
        msg: msg
      }]);
    });
    setTimeout(function () {
      setToasts(function (prev) {
        return prev.filter(function (t) {
          return t.id !== id;
        });
      });
    }, 2000);
  }
  function saveTeachers(t) {
    setTeachers(t);
    saveJSON("pca_teachers", t);
  }

  /* Data helpers with teacher prefix */
  function tKey(suffix) {
    return "pca_" + teacherId + "_" + suffix;
  }
  function loadT(suffix) {
    return loadJSON(tKey(suffix), []);
  }
  function saveT(suffix, data) {
    saveJSON(tKey(suffix), data);
  }

  /* 데이터 백업 (현재 교사 전체 데이터 JSON 다운로드) */
  function exportData() {
    var suffixes = ["c", "s", "b", "u", "r", "m"];
    var data = {
      _teacher: teacher,
      _exportedAt: new Date().toISOString()
    };
    suffixes.forEach(function (s) {
      data[s] = loadT(s);
    });
    /* AI 결과도 포함 */
    var subjects = loadT("b");
    var aiResults = {};
    subjects.forEach(function (sub) {
      var aiData = loadT("ai_" + sub.id);
      if (aiData && aiData.length > 0) aiResults[sub.id] = aiData;
    });
    data._ai = aiResults;
    var blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json"
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "pca_backup_" + (teacher ? teacher.name : "unknown") + "_" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    /* 즉시 revoke 하면 다운로드가 취소될 수 있어 지연 해제 */
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 10000);
    toast("백업 파일 다운로드 완료");
  }

  /* 데이터 복원 (JSON 파일 업로드) */
  function importData(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var data = JSON.parse(ev.target.result);
        var suffixes = ["c", "s", "b", "u", "r", "m"];
        var hasData = suffixes.some(function (s) {
          return data[s];
        });
        if (!hasData) {
          toast("유효하지 않은 백업 파일입니다");
          return;
        }
        suffixes.forEach(function (s) {
          if (data[s]) saveT(s, data[s]);
        });
        /* AI 결과 복원 */
        if (data._ai) {
          Object.keys(data._ai).forEach(function (subId) {
            saveT("ai_" + subId, data._ai[subId]);
          });
        }
        toast("데이터 복원 완료 — 페이지를 새로고침합니다");
        setTimeout(function () {
          location.reload();
        }, 1000);
      } catch (err) {
        toast("파일 읽기 오류: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = ""; /* 같은 파일 재선택 가능 */
  }
  var teacher = teachers.find(function (t) {
    return t.id === teacherId;
  });
  if (!authed) {
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(LockScreen, {
      onUnlock: function () {
        setAuthed(true);
      },
      toast: toast
    }), /*#__PURE__*/React.createElement(ToastContainer, {
      toasts: toasts
    }));
  }
  if (!teacherId) {
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(TeacherSelect, {
      teachers: teachers,
      saveTeachers: saveTeachers,
      onSelect: setTeacherId,
      toast: toast
    }), /*#__PURE__*/React.createElement("footer", {
      className: "app-footer",
      style: {
        marginLeft: 0,
        paddingBottom: 32
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "app-footer-inner"
    }, /*#__PURE__*/React.createElement("span", {
      className: "app-footer-brand"
    }, "\uACBD\uC0B0\uC790\uC778\uD559\uAD50"), /*#__PURE__*/React.createElement("span", {
      className: "app-footer-dot"
    }), /*#__PURE__*/React.createElement("span", null, "Process-Based Assessment System"), /*#__PURE__*/React.createElement("span", {
      className: "app-footer-dot"
    }), /*#__PURE__*/React.createElement("span", null, "\xA9 ", new Date().getFullYear()))), /*#__PURE__*/React.createElement(ToastContainer, {
      toasts: toasts
    }));
  }
  var menus = [{
    key: "home",
    icon: "🏠",
    label: "홈"
  }, {
    key: "class",
    icon: "🏫",
    label: "반 관리"
  }, {
    key: "students",
    icon: "👩‍🎓",
    label: "학생 목록"
  }, {
    key: "subject",
    icon: "📚",
    label: "과목 관리"
  }, {
    key: "unit",
    icon: "📝",
    label: "단원/평가기준"
  }, {
    key: "memo",
    icon: "✏️",
    label: "단원별 메모"
  }, {
    key: "ai",
    icon: "🤖",
    label: "교과학습발달상황"
  }];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("header", {
    className: "app-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "logo"
  }, "\uD83D\uDCCB ", /*#__PURE__*/React.createElement("span", null, "\uACBD\uC0B0\uC790\uC778\uD559\uAD50"), " \xB7 \uACFC\uC815\uC911\uC2EC\uD3C9\uAC00 \uAD00\uB9AC"), /*#__PURE__*/React.createElement("div", {
    className: "teacher-info"
  }, /*#__PURE__*/React.createElement("span", null, teacher ? teacher.name : "", " \uC120\uC0DD\uB2D8"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: function () {
      setTeacherId(null);
      setPage("home");
    }
  }, "\uAD50\uC0AC \uBCC0\uACBD"))), /*#__PURE__*/React.createElement("nav", {
    className: "sidebar"
  }, menus.map(function (m) {
    return /*#__PURE__*/React.createElement("button", {
      key: m.key,
      className: "sidebar-item" + (page === m.key ? " active" : ""),
      onClick: function () {
        setPage(m.key);
      }
    }, /*#__PURE__*/React.createElement("span", null, m.icon), /*#__PURE__*/React.createElement("span", null, m.label));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 12px",
      borderTop: "1px solid var(--card-border)",
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "sidebar-item",
    style: {
      fontSize: 13
    },
    onClick: exportData
  }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDCBE"), /*#__PURE__*/React.createElement("span", null, "\uB370\uC774\uD130 \uBC31\uC5C5")), /*#__PURE__*/React.createElement("label", {
    className: "sidebar-item",
    style: {
      fontSize: 13,
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDCC2"), /*#__PURE__*/React.createElement("span", null, "\uB370\uC774\uD130 \uBCF5\uC6D0"), /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: ".json",
    onChange: importData,
    style: {
      display: "none"
    }
  })))), /*#__PURE__*/React.createElement("div", {
    className: "main"
  }, page === "home" && /*#__PURE__*/React.createElement(PageHome, {
    setPage: setPage,
    loadT: loadT
  }), page === "class" && /*#__PURE__*/React.createElement(PageClass, {
    loadT: loadT,
    saveT: saveT,
    toast: toast,
    setModal: setModal
  }), page === "students" && /*#__PURE__*/React.createElement(PageStudents, {
    loadT: loadT
  }), page === "subject" && /*#__PURE__*/React.createElement(PageSubject, {
    loadT: loadT,
    saveT: saveT,
    toast: toast,
    setModal: setModal
  }), page === "unit" && /*#__PURE__*/React.createElement(PageUnit, {
    loadT: loadT,
    saveT: saveT,
    toast: toast,
    setModal: setModal
  }), page === "memo" && /*#__PURE__*/React.createElement(PageMemo, {
    loadT: loadT,
    saveT: saveT,
    toast: toast
  }), page === "ai" && /*#__PURE__*/React.createElement(PageAI, {
    loadT: loadT,
    saveT: saveT,
    toast: toast
  })), /*#__PURE__*/React.createElement("footer", {
    className: "app-footer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "app-footer-inner"
  }, /*#__PURE__*/React.createElement("span", {
    className: "app-footer-brand"
  }, "\uACBD\uC0B0\uC790\uC778\uD559\uAD50"), /*#__PURE__*/React.createElement("span", {
    className: "app-footer-dot"
  }), /*#__PURE__*/React.createElement("span", null, "Process-Based Assessment System"), /*#__PURE__*/React.createElement("span", {
    className: "app-footer-dot"
  }), /*#__PURE__*/React.createElement("span", null, "\xA9 ", new Date().getFullYear()))), modal && /*#__PURE__*/React.createElement(Modal, {
    modal: modal,
    setModal: setModal
  }), /*#__PURE__*/React.createElement(ToastContainer, {
    toasts: toasts
  }));
}

/* ============================
   LOCK SCREEN
   ============================ */
function LockScreen(props) {
  var _pw = useState("");
  var pw = _pw[0],
    setPw = _pw[1];
  var _shake = useState(false);
  var shake = _shake[0],
    setShake = _shake[1];
  function tryUnlock() {
    if (pw === APP_PASSWORD) {
      props.onUnlock();
    } else {
      props.toast("비밀번호가 틀렸습니다");
      setShake(true);
      setTimeout(function () {
        setShake(false);
      }, 500);
      setPw("");
    }
  }
  var dots = [0, 1, 2, 3];
  return /*#__PURE__*/React.createElement("div", {
    className: "lock-screen"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lock-box glass-strong" + (shake ? " shake-anim" : "")
  }, /*#__PURE__*/React.createElement("div", {
    className: "lock-icon"
  }, "\uD83C\uDFEB"), /*#__PURE__*/React.createElement("h1", {
    className: "lock-title"
  }, /*#__PURE__*/React.createElement("span", null, "\uACBD\uC0B0\uC790\uC778\uD559\uAD50")), /*#__PURE__*/React.createElement("p", {
    className: "lock-sub"
  }, "\uACFC\uC815\uC911\uC2EC\uD3C9\uAC00 \uAD00\uB9AC \uC2DC\uC2A4\uD15C"), /*#__PURE__*/React.createElement("div", {
    className: "lock-dots"
  }, dots.map(function (i) {
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "lock-dot" + (pw.length > i ? " filled" : "")
    });
  })), /*#__PURE__*/React.createElement("input", {
    type: "password",
    value: pw,
    maxLength: 4,
    onChange: function (e) {
      var v = e.target.value.replace(/[^0-9]/g, "");
      setPw(v);
      if (v.length === 4) {
        setTimeout(function () {
          if (v === APP_PASSWORD) {
            props.onUnlock();
          } else {
            props.toast("비밀번호가 틀렸습니다");
            setShake(true);
            setTimeout(function () {
              setShake(false);
            }, 500);
            setPw("");
          }
        }, 150);
      }
    },
    onKeyDown: function (e) {
      if (e.key === "Enter") tryUnlock();
    },
    className: "lock-input",
    placeholder: "\xB7\xB7\xB7\xB7",
    autoFocus: true
  }), /*#__PURE__*/React.createElement("p", {
    className: "lock-hint"
  }, "4\uC790\uB9AC \uC22B\uC790\uB97C \uC785\uB825\uD558\uC138\uC694")));
}

/* ============================
   TEACHER SELECT
   ============================ */
function TeacherSelect(props) {
  var _n = useState("");
  var name = _n[0],
    setName = _n[1];
  var _editId = useState(null);
  var editId = _editId[0],
    setEditId = _editId[1];
  var _editName = useState("");
  var editName = _editName[0],
    setEditName = _editName[1];
  var _confirmDelete = useState(null);
  var confirmDelete = _confirmDelete[0],
    setConfirmDelete = _confirmDelete[1];
  function addTeacher() {
    var n = name.trim();
    if (!n) return;
    if (props.teachers.some(function (t) {
      return t.name === n;
    })) {
      props.toast("이미 등록된 교사입니다");
      return;
    }
    var nw = props.teachers.concat([{
      id: uid(),
      name: n
    }]);
    props.saveTeachers(nw);
    setName("");
    props.toast(n + " 선생님 등록 완료");
  }
  function startEdit(t) {
    setEditId(t.id);
    setEditName(t.name);
  }
  function saveEdit() {
    var n = editName.trim();
    if (!n) return;
    if (props.teachers.some(function (t) {
      return t.id !== editId && t.name === n;
    })) {
      props.toast("이미 등록된 이름입니다");
      return;
    }
    var nw = props.teachers.map(function (t) {
      if (t.id === editId) return Object.assign({}, t, {
        name: n
      });
      return t;
    });
    props.saveTeachers(nw);
    setEditId(null);
    props.toast("이름 수정 완료");
  }
  function deleteTeacher(tid) {
    /* 해당 교사의 모든 데이터 삭제 (ai_ 결과 포함) */
    var keys = ["c", "s", "b", "u", "r", "m"];
    keys.forEach(function (k) {
      localStorage.removeItem("pca_" + tid + "_" + k);
    });
    /* ai_ 결과 키도 삭제: pca_{tid}_ai_{과목id} */
    var subjects = loadJSON("pca_" + tid + "_b", []);
    subjects.forEach(function (sub) {
      localStorage.removeItem("pca_" + tid + "_ai_" + sub.id);
    });
    var nw = props.teachers.filter(function (t) {
      return t.id !== tid;
    });
    props.saveTeachers(nw);
    setConfirmDelete(null);
    props.toast("교사 삭제 완료");
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "teacher-select-screen"
  }, /*#__PURE__*/React.createElement("div", {
    className: "teacher-select-box glass-strong"
  }, /*#__PURE__*/React.createElement("h1", null, "\uD83D\uDCCB ", /*#__PURE__*/React.createElement("span", null, "\uACBD\uC0B0\uC790\uC778\uD559\uAD50")), /*#__PURE__*/React.createElement("p", {
    className: "sub"
  }, "\uACFC\uC815\uC911\uC2EC\uD3C9\uAC00 \uAD00\uB9AC \uC2DC\uC2A4\uD15C"), /*#__PURE__*/React.createElement("p", {
    className: "mb-16",
    style: {
      fontWeight: 600,
      fontSize: 15
    }
  }, "\uAD50\uC0AC\uB97C \uC120\uD0DD\uD558\uC138\uC694"), /*#__PURE__*/React.createElement("div", {
    className: "teacher-grid"
  }, props.teachers.map(function (t) {
    if (editId === t.id) {
      return /*#__PURE__*/React.createElement("div", {
        key: t.id,
        className: "flex gap-8",
        style: {
          width: "100%"
        }
      }, /*#__PURE__*/React.createElement("input", {
        type: "text",
        value: editName,
        onChange: function (e) {
          setEditName(e.target.value);
        },
        onKeyDown: function (e) {
          if (e.key === "Enter") saveEdit();
        },
        style: {
          flex: 1,
          padding: "8px 12px"
        }
      }), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-pink btn-sm",
        onClick: saveEdit
      }, "\uC800\uC7A5"), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-ghost btn-sm",
        onClick: function () {
          setEditId(null);
        }
      }, "\uCDE8\uC18C"));
    }
    return /*#__PURE__*/React.createElement("div", {
      key: t.id,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "teacher-btn",
      style: {
        flex: 1
      },
      onClick: function () {
        props.onSelect(t.id);
      }
    }, t.name), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm",
      style: {
        padding: "6px 8px",
        fontSize: 12
      },
      onClick: function () {
        startEdit(t);
      }
    }, "\u270F\uFE0F"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-red btn-sm",
      style: {
        padding: "6px 8px",
        fontSize: 12
      },
      onClick: function () {
        setConfirmDelete(t.id);
      }
    }, "\u2715"));
  }), props.teachers.length === 0 && /*#__PURE__*/React.createElement("p", {
    className: "text-sub text-sm"
  }, "\uB4F1\uB85D\uB41C \uAD50\uC0AC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4")), confirmDelete && /*#__PURE__*/React.createElement("div", {
    style: {
      margin: "16px 0",
      padding: 16,
      borderRadius: 12,
      background: "rgba(251,113,133,0.1)",
      border: "1px solid rgba(251,113,133,0.3)"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontWeight: 600,
      marginBottom: 8
    }
  }, "\u26A0\uFE0F \uC815\uB9D0 \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-sub",
    style: {
      marginBottom: 12
    }
  }, "\uD574\uB2F9 \uAD50\uC0AC\uC758 \uBC18\xB7\uD559\uC0DD\xB7\uACFC\uBAA9\xB7\uB2E8\uC6D0\xB7\uBA54\uBAA8 \uB370\uC774\uD130\uAC00 \uBAA8\uB450 \uC0AD\uC81C\uB429\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-8"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-red btn-sm",
    onClick: function () {
      deleteTeacher(confirmDelete);
    }
  }, "\uC0AD\uC81C"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: function () {
      setConfirmDelete(null);
    }
  }, "\uCDE8\uC18C"))), /*#__PURE__*/React.createElement("div", {
    className: "teacher-add"
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "\uC0C8 \uAD50\uC0AC \uC774\uB984",
    value: name,
    onChange: function (e) {
      setName(e.target.value);
    },
    onKeyDown: function (e) {
      if (e.key === "Enter") addTeacher();
    },
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-pink",
    onClick: addTeacher
  }, "\uB4F1\uB85D"))));
}

/* ============================
   MODAL
   ============================ */
function Modal(props) {
  var m = props.modal;
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-overlay",
    onClick: function () {
      props.setModal(null);
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-box",
    onClick: function (e) {
      e.stopPropagation();
    }
  }, /*#__PURE__*/React.createElement("h3", null, "\u26A0\uFE0F ", m.title || "삭제 확인"), /*#__PURE__*/React.createElement("p", null, m.msg || "정말 삭제하시겠습니까?"), /*#__PURE__*/React.createElement("div", {
    className: "modal-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: function () {
      props.setModal(null);
    }
  }, "\uCDE8\uC18C"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-red",
    onClick: function () {
      m.onConfirm();
      props.setModal(null);
    }
  }, "\uC0AD\uC81C"))));
}

/* ============================
   TOAST
   ============================ */
function ToastContainer(props) {
  if (props.toasts.length === 0) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "toast-container"
  }, props.toasts.map(function (t) {
    return /*#__PURE__*/React.createElement("div", {
      key: t.id,
      className: "toast"
    }, t.msg);
  }));
}

/* ============================
   HOME
   ============================ */
function PageHome(props) {
  var classes = props.loadT("c");
  var students = props.loadT("s");
  var subjects = props.loadT("b");
  var units = props.loadT("u");
  var now = new Date();
  var hour = now.getHours();
  var greeting = hour < 6 ? "밤이 깊었습니다" : hour < 12 ? "좋은 아침입니다" : hour < 18 ? "좋은 오후입니다" : "수고 많으셨습니다";
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "home-hero glass-strong mb-16"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sub text-sm mb-8"
  }, greeting), /*#__PURE__*/React.createElement("h1", {
    className: "home-hero-title"
  }, "\uC624\uB298\uB3C4 \uC544\uC774\uB4E4\uC758 \uC131\uC7A5\uC744 \uAE30\uB85D\uD569\uB2C8\uB2E4.")), /*#__PURE__*/React.createElement("div", {
    className: "home-stats"
  }, /*#__PURE__*/React.createElement("div", {
    className: "home-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "home-stat-label"
  }, "\uAD00\uB9AC \uBC18"), /*#__PURE__*/React.createElement("div", {
    className: "home-stat-value"
  }, classes.length, /*#__PURE__*/React.createElement("span", {
    className: "home-stat-unit"
  }, "\uAC1C"))), /*#__PURE__*/React.createElement("div", {
    className: "home-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "home-stat-label"
  }, "\uD559\uC0DD"), /*#__PURE__*/React.createElement("div", {
    className: "home-stat-value"
  }, students.length, /*#__PURE__*/React.createElement("span", {
    className: "home-stat-unit"
  }, "\uBA85"))), /*#__PURE__*/React.createElement("div", {
    className: "home-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "home-stat-label"
  }, "\uACFC\uBAA9"), /*#__PURE__*/React.createElement("div", {
    className: "home-stat-value"
  }, subjects.length, /*#__PURE__*/React.createElement("span", {
    className: "home-stat-unit"
  }, "\uAC1C"))), /*#__PURE__*/React.createElement("div", {
    className: "home-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "home-stat-label"
  }, "\uB2E8\uC6D0"), /*#__PURE__*/React.createElement("div", {
    className: "home-stat-value"
  }, units.length, /*#__PURE__*/React.createElement("span", {
    className: "home-stat-unit"
  }, "\uAC1C"))))), /*#__PURE__*/React.createElement("div", {
    className: "home-card-grid"
  }, /*#__PURE__*/React.createElement("button", {
    className: "home-card-rich glass",
    onClick: function () {
      props.setPage("class");
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "home-card-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "home-card-emoji"
  }, "\uD83C\uDFEB"), /*#__PURE__*/React.createElement("span", {
    className: "home-card-chip"
  }, classes.length, "\uAC1C \uBC18 \xB7 ", students.length, "\uBA85")), /*#__PURE__*/React.createElement("div", {
    className: "home-card-title"
  }, "\uBC18 \uAD00\uB9AC"), /*#__PURE__*/React.createElement("div", {
    className: "home-card-desc"
  }, "\uD559\uB144\xB7\uBC18\uC744 \uB4F1\uB85D\uD558\uACE0 \uD559\uC0DD\uC758 \uC774\uB984\uACFC \uD2B9\uC131\uC744 \uAE30\uB85D\uD569\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("div", {
    className: "home-card-cta"
  }, "\uAD00\uB9AC\uD558\uAE30 \u2192")), /*#__PURE__*/React.createElement("button", {
    className: "home-card-rich glass",
    onClick: function () {
      props.setPage("students");
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "home-card-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "home-card-emoji"
  }, "\uD83D\uDC69\u200D\uD83C\uDF93"), /*#__PURE__*/React.createElement("span", {
    className: "home-card-chip"
  }, students.length, "\uBA85")), /*#__PURE__*/React.createElement("div", {
    className: "home-card-title"
  }, "\uD559\uC0DD \uBAA9\uB85D"), /*#__PURE__*/React.createElement("div", {
    className: "home-card-desc"
  }, "\uC804\uCCB4 \uD559\uC0DD\uC744 \uBC18\uBCC4\uB85C \uC870\uD68C\uD558\uACE0 \uAC80\uC0C9\uD569\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("div", {
    className: "home-card-cta"
  }, "\uC870\uD68C\uD558\uAE30 \u2192")), /*#__PURE__*/React.createElement("button", {
    className: "home-card-rich glass",
    onClick: function () {
      props.setPage("subject");
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "home-card-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "home-card-emoji"
  }, "\uD83D\uDCDA"), /*#__PURE__*/React.createElement("span", {
    className: "home-card-chip"
  }, subjects.length, "\uAC1C \uACFC\uBAA9")), /*#__PURE__*/React.createElement("div", {
    className: "home-card-title"
  }, "\uACFC\uBAA9 \uAD00\uB9AC"), /*#__PURE__*/React.createElement("div", {
    className: "home-card-desc"
  }, "\uB2F4\uB2F9 \uBC18\uBCC4\uB85C \uAC1C\uC124 \uACFC\uBAA9\uC744 \uB4F1\uB85D\uD558\uACE0 \uBB36\uC2B5\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("div", {
    className: "home-card-cta"
  }, "\uAD00\uB9AC\uD558\uAE30 \u2192")), /*#__PURE__*/React.createElement("button", {
    className: "home-card-rich glass",
    onClick: function () {
      props.setPage("unit");
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "home-card-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "home-card-emoji"
  }, "\uD83D\uDCDD"), /*#__PURE__*/React.createElement("span", {
    className: "home-card-chip"
  }, units.length, "\uAC1C \uB2E8\uC6D0")), /*#__PURE__*/React.createElement("div", {
    className: "home-card-title"
  }, "\uB2E8\uC6D0 / \uD3C9\uAC00\uAE30\uC900"), /*#__PURE__*/React.createElement("div", {
    className: "home-card-desc"
  }, "\uD559\uAE30\uBCC4 \uB2E8\uC6D0\uACFC \uC0C1\xB7\uC911\xB7\uD558 \uD3C9\uAC00\uAE30\uC900\uC744 \uC124\uC815\uD569\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("div", {
    className: "home-card-cta"
  }, "\uAD00\uB9AC\uD558\uAE30 \u2192")), /*#__PURE__*/React.createElement("button", {
    className: "home-card-rich glass",
    onClick: function () {
      props.setPage("memo");
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "home-card-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "home-card-emoji"
  }, "\u270F\uFE0F"), /*#__PURE__*/React.createElement("span", {
    className: "home-card-chip"
  }, "\uD559\uC0DD\uBCC4 \uAE30\uB85D")), /*#__PURE__*/React.createElement("div", {
    className: "home-card-title"
  }, "\uB2E8\uC6D0\uBCC4 \uBA54\uBAA8"), /*#__PURE__*/React.createElement("div", {
    className: "home-card-desc"
  }, "\uD559\uC0DD\uBCC4 \uB3C4\uB2EC \uC218\uC900\uACFC \uAD00\uCC30 \uBA54\uBAA8\uB97C \uB0A8\uAE41\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("div", {
    className: "home-card-cta"
  }, "\uC791\uC131\uD558\uAE30 \u2192")), /*#__PURE__*/React.createElement("button", {
    className: "home-card-rich glass home-card-highlight",
    onClick: function () {
      props.setPage("ai");
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "home-card-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "home-card-emoji"
  }, "\uD83E\uDD16"), /*#__PURE__*/React.createElement("span", {
    className: "home-card-chip home-card-chip-accent"
  }, "AI")), /*#__PURE__*/React.createElement("div", {
    className: "home-card-title"
  }, "\uAD50\uACFC\uD559\uC2B5\uBC1C\uB2EC\uC0C1\uD669"), /*#__PURE__*/React.createElement("div", {
    className: "home-card-desc"
  }, "\uC785\uB825\uB41C \uBA54\uBAA8\uB97C \uBC14\uD0D5\uC73C\uB85C \uB098\uC774\uC2A4 \uC785\uB825\uC6A9 \uCD08\uC548\uC744 \uC790\uB3D9 \uC0DD\uC131\uD569\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("div", {
    className: "home-card-cta"
  }, "\uC0DD\uC131\uD558\uAE30 \u2192"))));
}

/* ============================
   STUDENTS LIST (전체 학생 목록)
   ============================ */
function PageStudents(props) {
  var classes = props.loadT("c");
  var students = props.loadT("s");
  var _filterCi = useState("");
  var filterCi = _filterCi[0],
    setFilterCi = _filterCi[1];
  var _search = useState("");
  var search = _search[0],
    setSearch = _search[1];
  var filtered = students.filter(function (s) {
    if (filterCi && s.ci !== filterCi) return false;
    if (search) {
      var q = search.trim().toLowerCase();
      if (s.na.toLowerCase().indexOf(q) < 0 && String(s.nu).indexOf(q) < 0) return false;
    }
    return true;
  }).sort(function (a, b) {
    /* 반 이름순 → 번호순 */
    var ca = classes.find(function (c) {
      return c.id === a.ci;
    });
    var cb = classes.find(function (c) {
      return c.id === b.ci;
    });
    var na = ca ? ca.n : "";
    var nb = cb ? cb.n : "";
    if (na !== nb) return na < nb ? -1 : 1;
    return a.nu - b.nu;
  });
  function getClassName(cid) {
    var c = classes.find(function (c) {
      return c.id === cid;
    });
    return c ? c.n : "";
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "section-title"
  }, /*#__PURE__*/React.createElement("span", {
    className: "emoji"
  }, "\uD83D\uDC69\u200D\uD83C\uDF93"), "\uC804\uCCB4 \uD559\uC0DD \uBAA9\uB85D"), /*#__PURE__*/React.createElement("div", {
    className: "glass mb-16",
    style: {
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-8 items-center",
    style: {
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("select", {
    value: filterCi,
    onChange: function (e) {
      setFilterCi(e.target.value);
    },
    style: {
      width: 180
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "\uC804\uCCB4 \uBC18"), classes.map(function (c) {
    return /*#__PURE__*/React.createElement("option", {
      key: c.id,
      value: c.id
    }, c.n);
  })), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "\uC774\uB984 \uB610\uB294 \uBC88\uD638 \uAC80\uC0C9",
    value: search,
    onChange: function (e) {
      setSearch(e.target.value);
    },
    style: {
      flex: 1,
      maxWidth: 240
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "tag"
  }, filtered.length, "\uBA85"))), filtered.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "glass text-center",
    style: {
      padding: 40
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sub"
  }, "\uB4F1\uB85D\uB41C \uD559\uC0DD\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.")), filtered.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "glass",
    style: {
      padding: 0,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: 14
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: "rgba(16,122,87,0.06)",
      textAlign: "left"
    }
  }, /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "12px 16px",
      fontWeight: 700
    }
  }, "\uBC18"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "12px 8px",
      fontWeight: 700,
      width: 50,
      textAlign: "center"
    }
  }, "\uBC88\uD638"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "12px 16px",
      fontWeight: 700
    }
  }, "\uC774\uB984"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "12px 16px",
      fontWeight: 700
    }
  }, "\uD2B9\uC131"))), /*#__PURE__*/React.createElement("tbody", null, filtered.map(function (s) {
    return /*#__PURE__*/React.createElement("tr", {
      key: s.id,
      style: {
        borderTop: "1px solid var(--card-border)"
      }
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "10px 16px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "tag"
    }, getClassName(s.ci))), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "10px 8px",
        textAlign: "center",
        fontWeight: 600
      }
    }, s.nu), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "10px 16px",
        fontWeight: 500
      }
    }, s.na), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "10px 16px",
        fontSize: 13,
        color: "var(--text-sub)"
      }
    }, s.ch || "—"));
  })))));
}

/* ============================
   CLASS MANAGEMENT
   ============================ */
function PageClass(props) {
  var _cls = useState(function () {
    return props.loadT("c");
  });
  var classes = _cls[0],
    setClasses = _cls[1];
  var _stu = useState(function () {
    return props.loadT("s");
  });
  var students = _stu[0],
    setStudents = _stu[1];
  var _level = useState(null); /* "중" 또는 "고" */
  var level = _level[0],
    setLevel = _level[1];
  var _grade = useState(null);
  var grade = _grade[0],
    setGrade = _grade[1];
  var _cnum = useState(null);
  var cnum = _cnum[0],
    setCnum = _cnum[1];
  var _sname = useState("");
  var sname = _sname[0],
    setSname = _sname[1];
  var _snum = useState("");
  var snum = _snum[0],
    setSnum = _snum[1];
  var _editChar = useState(null);
  var editChar = _editChar[0],
    setEditChar = _editChar[1];
  var _charText = useState("");
  var charText = _charText[0],
    setCharText = _charText[1];
  var _editStudent = useState(null); /* 학생 정보 편집 중 ID */
  var editStudent = _editStudent[0],
    setEditStudent = _editStudent[1];
  var _editStuNum = useState("");
  var editStuNum = _editStuNum[0],
    setEditStuNum = _editStuNum[1];
  var _editStuName = useState("");
  var editStuName = _editStuName[0],
    setEditStuName = _editStuName[1];
  var _addingCid = useState(null); /* 학생 추가 중인 반 ID */
  var addingCid = _addingCid[0],
    setAddingCid = _addingCid[1];
  function addClass() {
    if (!level || !grade || !cnum) {
      props.toast("학교급·학년·반을 모두 선택하세요");
      return;
    }
    var n = level + " " + grade + "학년 " + cnum + "반";
    if (classes.some(function (c) {
      return c.n === n;
    })) {
      props.toast("이미 등록된 반입니다");
      return;
    }
    var nw = classes.concat([{
      id: uid(),
      n: n
    }]);
    props.saveT("c", nw);
    setClasses(nw);
    setLevel(null);
    setGrade(null);
    setCnum(null);
    props.toast(n + " 추가 완료");
  }
  function deleteClass(cid) {
    props.setModal({
      msg: "반을 삭제하면 소속 학생이 삭제되고, 해당 반만 연결된 과목·단원도 삭제됩니다.",
      onConfirm: function () {
        var nc = classes.filter(function (c) {
          return c.id !== cid;
        });
        props.saveT("c", nc);
        setClasses(nc);
        /* cascade students */
        var ns = students.filter(function (s) {
          return s.ci !== cid;
        });
        props.saveT("s", ns);
        setStudents(ns);
        /* cascade subjects: 다중 반 지원 — 해당 반을 cis에서 제거, cis가 빈 배열이면 과목 삭제 */
        var subjects = props.loadT("b");
        var updatedSubs = [];
        var delSubIds = [];
        subjects.forEach(function (b) {
          var cids = b.cis || (b.ci ? [b.ci] : []);
          var remaining = cids.filter(function (c) {
            return c !== cid;
          });
          if (remaining.length === 0) {
            delSubIds.push(b.id);
          } else {
            updatedSubs.push(Object.assign({}, b, {
              cis: remaining,
              ci: undefined
            }));
          }
        });
        props.saveT("b", updatedSubs);
        /* cascade units/rubrics/memos for deleted subjects */
        var units = props.loadT("u");
        var delUnitIds = units.filter(function (u) {
          return delSubIds.indexOf(u.bi) >= 0;
        }).map(function (u) {
          return u.id;
        });
        props.saveT("u", units.filter(function (u) {
          return delSubIds.indexOf(u.bi) < 0;
        }));
        var rubrics = props.loadT("r");
        props.saveT("r", rubrics.filter(function (r) {
          return delUnitIds.indexOf(r.ui) < 0;
        }));
        var memos = props.loadT("m");
        props.saveT("m", memos.filter(function (m) {
          return delUnitIds.indexOf(m.ui) < 0;
        }));
        props.toast("삭제 완료");
      }
    });
  }
  function addStudent(cid) {
    var nu = parseInt(snum);
    var nm = sname.trim();
    if (!nu || !nm) {
      props.toast("번호와 이름을 입력하세요");
      return;
    }
    if (students.some(function (s) {
      return s.ci === cid && s.nu === nu;
    })) {
      props.toast("이미 등록된 번호입니다");
      return;
    }
    var nw = students.concat([{
      id: uid(),
      ci: cid,
      na: nm,
      nu: nu,
      ch: ""
    }]);
    props.saveT("s", nw);
    setStudents(nw);
    setSname("");
    setSnum("");
    /* 입력란은 열어둠 — 연속 추가 편의 */
    props.toast(nm + " 추가 완료");
  }
  function openAddStudent(cid) {
    setAddingCid(cid);
    setSnum("");
    setSname("");
  }
  function deleteStudent(sid) {
    props.setModal({
      msg: "학생을 삭제하시겠습니까?",
      onConfirm: function () {
        var ns = students.filter(function (s) {
          return s.id !== sid;
        });
        props.saveT("s", ns);
        setStudents(ns);
        var memos = props.loadT("m");
        props.saveT("m", memos.filter(function (m) {
          return m.si !== sid;
        }));
        props.toast("삭제 완료");
      }
    });
  }
  function openChar(sid) {
    var s = students.find(function (s) {
      return s.id === sid;
    });
    setEditChar(sid);
    setCharText(s ? s.ch : "");
  }
  function saveChar() {
    var ns = students.map(function (s) {
      if (s.id === editChar) return Object.assign({}, s, {
        ch: charText
      });
      return s;
    });
    props.saveT("s", ns);
    setStudents(ns);
    setEditChar(null);
    props.toast("특성 저장 완료");
  }
  function startEditStudent(st) {
    setEditStudent(st.id);
    setEditStuNum(String(st.nu));
    setEditStuName(st.na);
  }
  function saveEditStudent(cid) {
    var nu = parseInt(editStuNum);
    var nm = editStuName.trim();
    if (!nu || !nm) {
      props.toast("번호와 이름을 입력하세요");
      return;
    }
    /* 같은 반에서 다른 학생과 번호 중복 방지 */
    if (students.some(function (s) {
      return s.ci === cid && s.nu === nu && s.id !== editStudent;
    })) {
      props.toast("이미 사용 중인 번호입니다");
      return;
    }
    var ns = students.map(function (s) {
      if (s.id === editStudent) return Object.assign({}, s, {
        nu: nu,
        na: nm
      });
      return s;
    });
    props.saveT("s", ns);
    setStudents(ns);
    setEditStudent(null);
    props.toast("학생 정보 수정 완료");
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "section-title"
  }, /*#__PURE__*/React.createElement("span", {
    className: "emoji"
  }, "\uD83C\uDFEB"), "\uBC18 \uAD00\uB9AC"), /*#__PURE__*/React.createElement("div", {
    className: "glass mb-16",
    style: {
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontWeight: 600,
      marginBottom: 12
    }
  }, "\uD559\uAD50\uAE09 \uC120\uD0DD"), /*#__PURE__*/React.createElement("div", {
    className: "num-btn-group mb-12"
  }, /*#__PURE__*/React.createElement("button", {
    className: "num-btn" + (level === "중" ? " active" : ""),
    style: {
      width: "auto",
      padding: "0 20px"
    },
    onClick: function () {
      setLevel("중");
    }
  }, "\uC911\uD559\uAD50"), /*#__PURE__*/React.createElement("button", {
    className: "num-btn" + (level === "고" ? " active" : ""),
    style: {
      width: "auto",
      padding: "0 20px"
    },
    onClick: function () {
      setLevel("고");
    }
  }, "\uACE0\uB4F1\uD559\uAD50")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontWeight: 600,
      marginBottom: 12
    }
  }, "\uD559\uB144 \uC120\uD0DD"), /*#__PURE__*/React.createElement("div", {
    className: "num-btn-group mb-12"
  }, [1, 2, 3].map(function (g) {
    return /*#__PURE__*/React.createElement("button", {
      key: g,
      className: "num-btn" + (grade === g ? " active" : ""),
      onClick: function () {
        setGrade(g);
      }
    }, g);
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      fontWeight: 600,
      marginBottom: 12
    }
  }, "\uBC18 \uC120\uD0DD"), /*#__PURE__*/React.createElement("div", {
    className: "num-btn-group mb-12"
  }, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (c) {
    return /*#__PURE__*/React.createElement("button", {
      key: c,
      className: "num-btn" + (cnum === c ? " active" : ""),
      onClick: function () {
        setCnum(c);
      }
    }, c);
  })), level && grade && cnum && /*#__PURE__*/React.createElement("p", {
    className: "mb-12",
    style: {
      fontWeight: 600,
      color: "var(--pink)"
    }
  }, level, " ", grade, "\uD559\uB144 ", cnum, "\uBC18"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-pink",
    onClick: addClass
  }, "\uBC18 \uCD94\uAC00")), /*#__PURE__*/React.createElement("div", {
    className: "card-list"
  }, classes.map(function (cl) {
    var clStudents = students.filter(function (s) {
      return s.ci === cl.id;
    }).sort(function (a, b) {
      return a.nu - b.nu;
    });
    return /*#__PURE__*/React.createElement("div", {
      key: cl.id,
      className: "card-item glass"
    }, /*#__PURE__*/React.createElement("div", {
      className: "card-header"
    }, /*#__PURE__*/React.createElement("span", {
      className: "card-title"
    }, cl.n), /*#__PURE__*/React.createElement("div", {
      className: "flex gap-8"
    }, /*#__PURE__*/React.createElement("span", {
      className: "tag"
    }, clStudents.length, "\uBA85"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-red btn-sm",
      onClick: function () {
        deleteClass(cl.id);
      }
    }, "\uC0AD\uC81C"))), clStudents.map(function (st) {
      if (editStudent === st.id) {
        return /*#__PURE__*/React.createElement("div", {
          key: st.id,
          className: "flex items-center gap-8 mb-8",
          style: {
            paddingLeft: 8
          }
        }, /*#__PURE__*/React.createElement("input", {
          type: "number",
          value: editStuNum,
          onChange: function (e) {
            setEditStuNum(e.target.value);
          },
          style: {
            width: 60
          },
          min: "1",
          max: "30"
        }), /*#__PURE__*/React.createElement("input", {
          type: "text",
          value: editStuName,
          onChange: function (e) {
            setEditStuName(e.target.value);
          },
          style: {
            flex: 1
          },
          onKeyDown: function (e) {
            if (e.key === "Enter") saveEditStudent(cl.id);
          }
        }), /*#__PURE__*/React.createElement("button", {
          className: "btn btn-pink btn-sm",
          onClick: function () {
            saveEditStudent(cl.id);
          }
        }, "\uC800\uC7A5"), /*#__PURE__*/React.createElement("button", {
          className: "btn btn-ghost btn-sm",
          onClick: function () {
            setEditStudent(null);
          }
        }, "\uCDE8\uC18C"));
      }
      return /*#__PURE__*/React.createElement("div", {
        key: st.id,
        className: "flex items-center gap-8 mb-8",
        style: {
          paddingLeft: 8
        }
      }, /*#__PURE__*/React.createElement("span", {
        className: "tag",
        style: {
          minWidth: 32,
          textAlign: "center"
        }
      }, st.nu), /*#__PURE__*/React.createElement("span", {
        style: {
          fontWeight: 500,
          flex: 1
        }
      }, st.na), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-ghost btn-sm",
        style: {
          padding: "4px 8px",
          fontSize: 11
        },
        onClick: function () {
          startEditStudent(st);
        }
      }, "\u270F\uFE0F"), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-ghost btn-sm",
        onClick: function () {
          openChar(st.id);
        }
      }, "\uD2B9\uC131"), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-red btn-sm",
        onClick: function () {
          deleteStudent(st.id);
        }
      }, "\uC0AD\uC81C"));
    }), editChar && students.some(function (s) {
      return s.id === editChar && s.ci === cl.id;
    }) && /*#__PURE__*/React.createElement("div", {
      className: "glass",
      style: {
        padding: 16,
        margin: "12px 0"
      }
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-sm mb-8",
      style: {
        fontWeight: 600
      }
    }, "\uD559\uC0DD \uD2B9\uC131"), /*#__PURE__*/React.createElement("textarea", {
      value: charText,
      onChange: function (e) {
        setCharText(e.target.value);
      },
      placeholder: "\uC608: \uC18C\uADFC\uC721 \uC57D\uD568, \uAE00\uC790 \uC778\uC2DD \uB290\uB9BC, \uC9D1\uC911\uC2DC\uAC04 \uC9E7\uC74C"
    }), /*#__PURE__*/React.createElement("div", {
      className: "flex gap-8 mt-12"
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-pink btn-sm",
      onClick: saveChar
    }, "\uC800\uC7A5"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm",
      onClick: function () {
        setEditChar(null);
      }
    }, "\uCDE8\uC18C"))), addingCid === cl.id ? /*#__PURE__*/React.createElement("div", {
      className: "flex gap-8 mt-12",
      style: {
        paddingLeft: 8
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "number",
      placeholder: "\uBC88\uD638",
      value: snum,
      onChange: function (e) {
        setSnum(e.target.value);
      },
      style: {
        width: 70
      },
      min: "1",
      max: "30"
    }), /*#__PURE__*/React.createElement("input", {
      type: "text",
      placeholder: "\uC774\uB984",
      value: sname,
      onChange: function (e) {
        setSname(e.target.value);
      },
      style: {
        flex: 1
      },
      onKeyDown: function (e) {
        if (e.key === "Enter") addStudent(cl.id);
      }
    }), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-mint btn-sm",
      onClick: function () {
        addStudent(cl.id);
      }
    }, "\uCD94\uAC00"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm",
      onClick: function () {
        setAddingCid(null);
      }
    }, "\uB2EB\uAE30")) : /*#__PURE__*/React.createElement("div", {
      className: "mt-12",
      style: {
        paddingLeft: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm",
      onClick: function () {
        openAddStudent(cl.id);
      }
    }, "+ \uD559\uC0DD \uCD94\uAC00")));
  })));
}

/* ============================
   SUBJECT MANAGEMENT
   ============================ */
function PageSubject(props) {
  var _sub = useState(function () {
    return props.loadT("b");
  });
  var subjects = _sub[0],
    setSubjects = _sub[1];
  var classes = props.loadT("c");
  var _selCids = useState([]); /* 선택된 반 ID 배열 */
  var selCids = _selCids[0],
    setSelCids = _selCids[1];
  var _name = useState("");
  var name = _name[0],
    setName = _name[1];

  /* 과목 마이그레이션: ci → cis (하위 호환) */
  useEffect(function () {
    var needMigrate = subjects.some(function (s) {
      return s.ci && !s.cis;
    });
    if (needMigrate) {
      var migrated = subjects.map(function (s) {
        if (s.ci && !s.cis) return Object.assign({}, s, {
          cis: [s.ci],
          ci: undefined
        });
        return s;
      });
      props.saveT("b", migrated);
      setSubjects(migrated);
    }
  }, []);

  /* 과목의 반 ID 배열 가져오기 (하위 호환) */
  function getSubCids(sub) {
    if (sub.cis) return sub.cis;
    if (sub.ci) return [sub.ci];
    return [];
  }
  function toggleCid(cid) {
    setSelCids(function (prev) {
      if (prev.indexOf(cid) >= 0) return prev.filter(function (c) {
        return c !== cid;
      });
      return prev.concat([cid]);
    });
  }
  function addSubject() {
    var nm = name.trim();
    if (selCids.length === 0 || !nm) {
      props.toast("반을 선택하고 과목명을 입력하세요");
      return;
    }
    /* 같은 이름의 과목이 같은 반 조합으로 이미 있는지 (이름만 체크) */
    if (subjects.some(function (s) {
      return s.na === nm;
    })) {
      props.toast("이미 등록된 과목명입니다");
      return;
    }
    var nw = subjects.concat([{
      id: uid(),
      na: nm,
      cis: selCids.slice()
    }]);
    props.saveT("b", nw);
    setSubjects(nw);
    setName("");
    setSelCids([]);
    props.toast(nm + " 추가 완료");
  }
  function deleteSubject(sid) {
    var sub = subjects.find(function (s) {
      return s.id === sid;
    });
    props.setModal({
      msg: (sub ? sub.na : "과목") + "을(를) 삭제하면 소속 단원과 AI 결과가 모두 삭제됩니다.",
      onConfirm: function () {
        var ns = subjects.filter(function (s) {
          return s.id !== sid;
        });
        props.saveT("b", ns);
        setSubjects(ns);
        var units = props.loadT("u");
        var delUids = units.filter(function (u) {
          return u.bi === sid;
        }).map(function (u) {
          return u.id;
        });
        props.saveT("u", units.filter(function (u) {
          return u.bi !== sid;
        }));
        var rubrics = props.loadT("r");
        props.saveT("r", rubrics.filter(function (r) {
          return delUids.indexOf(r.ui) < 0;
        }));
        var memos = props.loadT("m");
        props.saveT("m", memos.filter(function (m) {
          return delUids.indexOf(m.ui) < 0;
        }));
        /* AI 결과 삭제 */
        props.saveT("ai_" + sid, []);
        props.toast("삭제 완료");
      }
    });
  }
  function getClassNames(sub) {
    var cids = getSubCids(sub);
    return cids.map(function (cid) {
      var c = classes.find(function (c) {
        return c.id === cid;
      });
      return c ? c.n : "";
    }).filter(Boolean).join(", ");
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "section-title"
  }, /*#__PURE__*/React.createElement("span", {
    className: "emoji"
  }, "\uD83D\uDCDA"), "\uACFC\uBAA9 \uAD00\uB9AC"), /*#__PURE__*/React.createElement("div", {
    className: "glass mb-16",
    style: {
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontWeight: 600,
      marginBottom: 8
    }
  }, "\uB2F4\uB2F9 \uBC18 \uC120\uD0DD (\uBCF5\uC218 \uC120\uD0DD \uAC00\uB2A5)"), /*#__PURE__*/React.createElement("div", {
    className: "num-btn-group mb-12"
  }, classes.map(function (c) {
    var isSelected = selCids.indexOf(c.id) >= 0;
    return /*#__PURE__*/React.createElement("button", {
      key: c.id,
      className: "num-btn" + (isSelected ? " active" : ""),
      style: {
        width: "auto",
        padding: "0 14px",
        fontSize: 13,
        height: 40
      },
      onClick: function () {
        toggleCid(c.id);
      }
    }, c.n);
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-8 items-center"
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "\uACFC\uBAA9\uBA85",
    value: name,
    onChange: function (e) {
      setName(e.target.value);
    },
    style: {
      flex: 1
    },
    onKeyDown: function (e) {
      if (e.key === "Enter") addSubject();
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-pink",
    onClick: addSubject
  }, "\uCD94\uAC00")), selCids.length > 0 && /*#__PURE__*/React.createElement("p", {
    className: "text-sm mt-12",
    style: {
      color: "var(--pink)"
    }
  }, "\uC120\uD0DD: ", selCids.map(function (cid) {
    var c = classes.find(function (c) {
      return c.id === cid;
    });
    return c ? c.n : "";
  }).join(", "))), /*#__PURE__*/React.createElement("div", {
    className: "card-list"
  }, subjects.map(function (sub) {
    return /*#__PURE__*/React.createElement("div", {
      key: sub.id,
      className: "card-item glass"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-8",
      style: {
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600
      }
    }, sub.na), getSubCids(sub).map(function (cid) {
      var c = classes.find(function (c) {
        return c.id === cid;
      });
      return c ? /*#__PURE__*/React.createElement("span", {
        key: cid,
        className: "tag"
      }, c.n) : null;
    })), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-red btn-sm",
      onClick: function () {
        deleteSubject(sub.id);
      }
    }, "\uC0AD\uC81C")));
  })));
}

/* ============================
   UNIT / RUBRIC
   ============================ */
function PageUnit(props) {
  var subjects = props.loadT("b");
  var classes = props.loadT("c");
  var _bi = useState("");
  var bi = _bi[0],
    setBi = _bi[1];
  var _sm = useState(1); /* 선택된 학기 (1 또는 2) */
  var sm = _sm[0],
    setSm = _sm[1];
  var _units = useState(function () {
    return props.loadT("u");
  });
  var units = _units[0],
    setUnits = _units[1];
  var _rubrics = useState(function () {
    return props.loadT("r");
  });
  var rubrics = _rubrics[0],
    setRubrics = _rubrics[1];
  var _uname = useState("");
  var uname = _uname[0],
    setUname = _uname[1];
  var _editUid = useState(null);
  var editUid = _editUid[0],
    setEditUid = _editUid[1];
  var _rH = useState("");
  var rH = _rH[0],
    setRH = _rH[1];
  var _rM = useState("");
  var rM = _rM[0],
    setRM = _rM[1];
  var _rL = useState("");
  var rL = _rL[0],
    setRL = _rL[1];

  /* 교육과정 불러오기 모달 상태 */
  var _imp = useState(false);
  var showImp = _imp[0],
    setShowImp = _imp[1];
  var _impG = useState("");
  var impG = _impG[0],
    setImpG = _impG[1];
  var _impS = useState("");
  var impS = _impS[0],
    setImpS = _impS[1];
  var _impSel = useState({});
  var impSel = _impSel[0],
    setImpSel = _impSel[1];

  /* 기존 단원 마이그레이션: sm 필드 없으면 1학기로 자동 지정 */
  useEffect(function () {
    var needMigrate = units.some(function (u) {
      return !u.sm;
    });
    if (needMigrate) {
      var migrated = units.map(function (u) {
        if (!u.sm) return Object.assign({}, u, {
          sm: 1
        });
        return u;
      });
      props.saveT("u", migrated);
      setUnits(migrated);
    }
  }, []);
  var filteredUnits = units.filter(function (u) {
    return u.bi === bi && (u.sm || 1) === sm;
  }).sort(function (a, b) {
    return a.or - b.or;
  });
  function addUnit() {
    var nm = uname.trim();
    if (!bi || !nm) {
      props.toast("과목과 단원명을 입력하세요");
      return;
    }
    /* 같은 과목·같은 학기에 동일 이름 중복 방지 */
    if (units.some(function (u) {
      return u.bi === bi && (u.sm || 1) === sm && u.na === nm;
    })) {
      props.toast("이미 등록된 단원입니다");
      return;
    }
    var maxOr = filteredUnits.reduce(function (mx, u) {
      return Math.max(mx, u.or);
    }, 0);
    var nw = units.concat([{
      id: uid(),
      bi: bi,
      na: nm,
      or: maxOr + 1,
      sm: sm
    }]);
    props.saveT("u", nw);
    setUnits(nw);
    setUname("");
    props.toast(sm + "학기 단원 추가 완료");
  }
  function deleteUnit(uid2) {
    props.setModal({
      msg: "단원을 삭제하시겠습니까?",
      onConfirm: function () {
        var nu = units.filter(function (u) {
          return u.id !== uid2;
        });
        props.saveT("u", nu);
        setUnits(nu);
        var nr = rubrics.filter(function (r) {
          return r.ui !== uid2;
        });
        props.saveT("r", nr);
        setRubrics(nr);
        var memos = props.loadT("m");
        props.saveT("m", memos.filter(function (m) {
          return m.ui !== uid2;
        }));
        props.toast("삭제 완료");
      }
    });
  }
  function moveUnit(uid2, direction) {
    /* direction: -1 (위로), +1 (아래로) */
    var idx = filteredUnits.findIndex(function (u) {
      return u.id === uid2;
    });
    if (idx < 0) return;
    var swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= filteredUnits.length) return;
    var thisUnit = filteredUnits[idx];
    var swapUnit = filteredUnits[swapIdx];
    /* or 값 교환 */
    var nw = units.map(function (u) {
      if (u.id === thisUnit.id) return Object.assign({}, u, {
        or: swapUnit.or
      });
      if (u.id === swapUnit.id) return Object.assign({}, u, {
        or: thisUnit.or
      });
      return u;
    });
    props.saveT("u", nw);
    setUnits(nw);
  }
  function openRubric(uid2) {
    setEditUid(uid2);
    var r = rubrics.find(function (r) {
      return r.ui === uid2;
    });
    if (r) {
      setRH(r.h);
      setRM(r.m);
      setRL(r.l);
    } else {
      setRH("");
      setRM("");
      setRL("");
    }
  }
  function saveRubric() {
    var existing = rubrics.find(function (r) {
      return r.ui === editUid;
    });
    var nr;
    if (existing) {
      nr = rubrics.map(function (r) {
        if (r.ui === editUid) return Object.assign({}, r, {
          h: rH,
          m: rM,
          l: rL
        });
        return r;
      });
    } else {
      nr = rubrics.concat([{
        id: uid(),
        ui: editUid,
        h: rH,
        m: rM,
        l: rL
      }]);
    }
    props.saveT("r", nr);
    setRubrics(nr);
    setEditUid(null);
    props.toast("평가기준 저장 완료");
  }
  function hasRubric(uid2) {
    return rubrics.some(function (r) {
      return r.ui === uid2 && (r.h || r.m || r.l);
    });
  }

  /* === 교육과정 불러오기 === */
  var PRESET = typeof window !== "undefined" && window.CURRICULUM_PRESET ? window.CURRICULUM_PRESET : {};
  function guessGrade() {
    var sub = subjects.find(function (s) {
      return s.id === bi;
    });
    if (!sub) return "";
    var cids = sub.cis || (sub.ci ? [sub.ci] : []);
    if (!cids.length) return "";
    var cls = classes.find(function (c) {
      return c.id === cids[0];
    });
    if (!cls) return "";
    var m = cls.n.match(/(중|고)\s*(\d)/);
    return m ? m[1] + m[2] : "";
  }
  function openImport() {
    var g = guessGrade();
    setImpG(g);
    var sub = subjects.find(function (s) {
      return s.id === bi;
    });
    var sname = sub ? sub.na : "";
    var presetSubs = g && PRESET[g] ? Object.keys(PRESET[g]) : [];
    setImpS(presetSubs.indexOf(sname) >= 0 ? sname : "");
    setImpSel({});
    setShowImp(true);
  }
  function impUnitList() {
    if (!impG || !impS) return [];
    return PRESET[impG] && PRESET[impG][impS] ? PRESET[impG][impS] : [];
  }
  function toggleImpAll() {
    var arr = impUnitList();
    var anyUnsel = arr.some(function (_, i) {
      return !impSel[i];
    });
    var ns = {};
    if (anyUnsel) arr.forEach(function (_, i) {
      ns[i] = true;
    });
    setImpSel(ns);
  }
  function doImport() {
    var arr = impUnitList();
    var picked = arr.filter(function (_, i) {
      return impSel[i];
    });
    if (!picked.length) {
      props.toast("단원을 선택하세요");
      return;
    }
    var curUnits = props.loadT("u");
    var curRubrics = props.loadT("r");
    var maxOr = filteredUnits.reduce(function (mx, u) {
      return Math.max(mx, u.or);
    }, 0);
    var added = 0,
      skipped = 0;
    picked.forEach(function (p) {
      if (curUnits.some(function (u) {
        return u.bi === bi && (u.sm || 1) === sm && u.na === p.u;
      })) {
        skipped++;
        return;
      }
      maxOr++;
      var nid = uid();
      curUnits = curUnits.concat([{
        id: nid,
        bi: bi,
        na: p.u,
        or: maxOr,
        sm: sm
      }]);
      curRubrics = curRubrics.concat([{
        id: uid(),
        ui: nid,
        h: p.h || "",
        m: p.m || "",
        l: p.l || ""
      }]);
      added++;
    });
    props.saveT("u", curUnits);
    setUnits(curUnits);
    props.saveT("r", curRubrics);
    setRubrics(curRubrics);
    setShowImp(false);
    setImpSel({});
    props.toast(added + "개 단원 불러옴" + (skipped ? " (" + skipped + "개 중복 제외)" : ""));
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "section-title"
  }, /*#__PURE__*/React.createElement("span", {
    className: "emoji"
  }, "\uD83D\uDCDD"), "\uB2E8\uC6D0 / \uD3C9\uAC00\uAE30\uC900"), /*#__PURE__*/React.createElement("div", {
    className: "glass mb-16",
    style: {
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-8 items-center mb-12"
  }, /*#__PURE__*/React.createElement("select", {
    value: bi,
    onChange: function (e) {
      setBi(e.target.value);
    },
    style: {
      width: 220
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "\uACFC\uBAA9 \uC120\uD0DD"), subjects.map(function (s) {
    return /*#__PURE__*/React.createElement("option", {
      key: s.id,
      value: s.id
    }, s.na);
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-8",
    style: {
      marginLeft: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "num-btn" + (sm === 1 ? " active" : ""),
    style: {
      width: "auto",
      padding: "0 16px"
    },
    onClick: function () {
      setSm(1);
    }
  }, "1\uD559\uAE30"), /*#__PURE__*/React.createElement("button", {
    className: "num-btn" + (sm === 2 ? " active" : ""),
    style: {
      width: "auto",
      padding: "0 16px"
    },
    onClick: function () {
      setSm(2);
    }
  }, "2\uD559\uAE30"))), bi && /*#__PURE__*/React.createElement("div", {
    className: "flex gap-8"
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: sm + "학기 단원명 (예: 7. 안전한 이동)",
    value: uname,
    onChange: function (e) {
      setUname(e.target.value);
    },
    style: {
      flex: 1
    },
    onKeyDown: function (e) {
      if (e.key === "Enter") addUnit();
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-pink",
    onClick: addUnit
  }, "\uCD94\uAC00")), bi && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-mint",
    style: {
      marginTop: 12
    },
    onClick: openImport
  }, "\uD83D\uDCE5 \uAD50\uC721\uACFC\uC815\uC5D0\uC11C \uD3C9\uAC00\uAE30\uC900 \uBD88\uB7EC\uC624\uAE30")), /*#__PURE__*/React.createElement("div", {
    className: "card-list"
  }, filteredUnits.map(function (u, idx) {
    return /*#__PURE__*/React.createElement("div", {
      key: u.id,
      className: "card-item glass"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between mb-8"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-8"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex-col",
      style: {
        gap: 2,
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      style: {
        padding: "2px 6px",
        fontSize: 10,
        lineHeight: 1
      },
      disabled: idx === 0,
      onClick: function () {
        moveUnit(u.id, -1);
      }
    }, "\u25B2"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      style: {
        padding: "2px 6px",
        fontSize: 10,
        lineHeight: 1
      },
      disabled: idx === filteredUnits.length - 1,
      onClick: function () {
        moveUnit(u.id, 1);
      }
    }, "\u25BC")), /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600
      }
    }, u.na), hasRubric(u.id) ? /*#__PURE__*/React.createElement("span", {
      className: "tag tag-mint"
    }, "\u2713 \uB4F1\uB85D\uB428") : /*#__PURE__*/React.createElement("span", {
      className: "tag tag-red"
    }, "\u2717 \uBBF8\uB4F1\uB85D")), /*#__PURE__*/React.createElement("div", {
      className: "flex gap-8"
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-lavender btn-sm",
      onClick: function () {
        openRubric(u.id);
      }
    }, "\uD3C9\uAC00\uAE30\uC900"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-red btn-sm",
      onClick: function () {
        deleteUnit(u.id);
      }
    }, "\uC0AD\uC81C"))), editUid === u.id && /*#__PURE__*/React.createElement("div", {
      className: "glass",
      style: {
        padding: 16,
        marginTop: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "mb-12"
    }, /*#__PURE__*/React.createElement("p", {
      style: {
        fontWeight: 600,
        color: "#059669",
        marginBottom: 6
      }
    }, "\uD83D\uDFE2 \uC0C1"), /*#__PURE__*/React.createElement("textarea", {
      value: rH,
      onChange: function (e) {
        setRH(e.target.value);
      },
      placeholder: "\uC0C1 \uC218\uC900 \uD3C9\uAC00\uAE30\uC900",
      style: {
        borderColor: "rgba(52,211,153,0.3)"
      }
    })), /*#__PURE__*/React.createElement("div", {
      className: "mb-12"
    }, /*#__PURE__*/React.createElement("p", {
      style: {
        fontWeight: 600,
        color: "#d97706",
        marginBottom: 6
      }
    }, "\uD83D\uDFE1 \uC911"), /*#__PURE__*/React.createElement("textarea", {
      value: rM,
      onChange: function (e) {
        setRM(e.target.value);
      },
      placeholder: "\uC911 \uC218\uC900 \uD3C9\uAC00\uAE30\uC900",
      style: {
        borderColor: "rgba(251,191,36,0.3)"
      }
    })), /*#__PURE__*/React.createElement("div", {
      className: "mb-12"
    }, /*#__PURE__*/React.createElement("p", {
      style: {
        fontWeight: 600,
        color: "#e11d48",
        marginBottom: 6
      }
    }, "\uD83D\uDD34 \uD558"), /*#__PURE__*/React.createElement("textarea", {
      value: rL,
      onChange: function (e) {
        setRL(e.target.value);
      },
      placeholder: "\uD558 \uC218\uC900 \uD3C9\uAC00\uAE30\uC900",
      style: {
        borderColor: "rgba(251,113,133,0.3)"
      }
    })), /*#__PURE__*/React.createElement("div", {
      className: "flex gap-8"
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-pink btn-sm",
      onClick: saveRubric
    }, "\uC800\uC7A5"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm",
      onClick: function () {
        setEditUid(null);
      }
    }, "\uCDE8\uC18C"))));
  })), showImp && /*#__PURE__*/React.createElement("div", {
    className: "modal-overlay",
    onClick: function () {
      setShowImp(false);
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-box",
    style: {
      maxWidth: 600,
      width: "90%",
      textAlign: "left",
      maxHeight: "82vh",
      overflowY: "auto"
    },
    onClick: function (e) {
      e.stopPropagation();
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      textAlign: "center",
      marginBottom: 6
    }
  }, "\uD83D\uDCE5 \uAD50\uC721\uACFC\uC815 \uD3C9\uAC00\uAE30\uC900 \uBD88\uB7EC\uC624\uAE30"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-sub mb-16",
    style: {
      textAlign: "center"
    }
  }, "\uC120\uD0DD\uD55C \uB2E8\uC6D0\uC774 ", /*#__PURE__*/React.createElement("b", null, sm, "\uD559\uAE30"), "\uB85C \uCD94\uAC00\uB429\uB2C8\uB2E4"), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-8 mb-16"
  }, /*#__PURE__*/React.createElement("select", {
    value: impG,
    onChange: function (e) {
      setImpG(e.target.value);
      setImpS("");
      setImpSel({});
    },
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "\uD559\uB144"), Object.keys(PRESET).map(function (g) {
    return /*#__PURE__*/React.createElement("option", {
      key: g,
      value: g
    }, g);
  })), /*#__PURE__*/React.createElement("select", {
    value: impS,
    onChange: function (e) {
      setImpS(e.target.value);
      setImpSel({});
    },
    style: {
      flex: 2
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "\uACFC\uBAA9"), (impG && PRESET[impG] ? Object.keys(PRESET[impG]) : []).map(function (s) {
    return /*#__PURE__*/React.createElement("option", {
      key: s,
      value: s
    }, s);
  }))), impG && impS && impUnitList().length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mb-12"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-sm",
    style: {
      fontWeight: 600
    }
  }, "\uB2E8\uC6D0 ", impUnitList().length, "\uAC1C \xB7 \uC120\uD0DD ", Object.keys(impSel).length, "\uAC1C"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: toggleImpAll
  }, "\uC804\uCCB4 \uC120\uD0DD / \uD574\uC81C")), impUnitList().map(function (p, i) {
    return /*#__PURE__*/React.createElement("label", {
      key: i,
      className: "glass mb-8",
      style: {
        padding: 12,
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        cursor: "pointer"
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: !!impSel[i],
      style: {
        marginTop: 4,
        width: "auto"
      },
      onChange: function (e) {
        var ns = Object.assign({}, impSel);
        if (e.target.checked) ns[i] = true;else delete ns[i];
        setImpSel(ns);
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("p", {
      style: {
        fontWeight: 700,
        marginBottom: 6
      }
    }, p.u), /*#__PURE__*/React.createElement("div", {
      className: "rubric-preview",
      style: {
        marginTop: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "rp-row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "rp-label",
      style: {
        color: "#059669"
      }
    }, "\uC0C1: "), p.h || "—"), /*#__PURE__*/React.createElement("div", {
      className: "rp-row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "rp-label",
      style: {
        color: "#d97706"
      }
    }, "\uC911: "), p.m || "—"), /*#__PURE__*/React.createElement("div", {
      className: "rp-row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "rp-label",
      style: {
        color: "#e11d48"
      }
    }, "\uD558: "), p.l || "—"))));
  })), impG && impS && impUnitList().length === 0 && /*#__PURE__*/React.createElement("p", {
    className: "text-sub text-center",
    style: {
      padding: "20px 0"
    }
  }, "\uD574\uB2F9 \uACFC\uBAA9\uC5D0 \uB4F1\uB85D\uB41C \uB2E8\uC6D0\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-8 mt-16",
    style: {
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: function () {
      setShowImp(false);
    }
  }, "\uCDE8\uC18C"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-pink",
    onClick: doImport
  }, "\uC120\uD0DD \uB2E8\uC6D0 \uCD94\uAC00")), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-sub mt-12",
    style: {
      textAlign: "center"
    }
  }, "\u203B \uBD88\uB7EC\uC628 \uB4A4 \uAC01 \uB2E8\uC6D0\uC758 ", /*#__PURE__*/React.createElement("b", null, "\uD3C9\uAC00\uAE30\uC900"), " \uBC84\uD2BC\uC73C\uB85C \uBC14\uB85C \uC218\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4"))));
}

/* ============================
   MEMO
   ============================ */
function PageMemo(props) {
  var subjects = props.loadT("b");
  var classes = props.loadT("c");
  var allStudents = props.loadT("s");
  var units = props.loadT("u");
  var rubrics = props.loadT("r");
  var _bi = useState("");
  var bi = _bi[0],
    setBi = _bi[1];
  var _sm = useState(1);
  var sm = _sm[0],
    setSm = _sm[1];
  var _si = useState("");
  var si = _si[0],
    setSi = _si[1];
  var _memos = useState(function () {
    return props.loadT("m");
  });
  var memos = _memos[0],
    setMemos = _memos[1];
  var _savedAt = useState(null);
  var savedAt = _savedAt[0],
    setSavedAt = _savedAt[1];
  var selectedSub = subjects.find(function (s) {
    return s.id === bi;
  });
  var subCids = selectedSub ? selectedSub.cis || (selectedSub.ci ? [selectedSub.ci] : []) : [];
  var classStudents = selectedSub ? allStudents.filter(function (s) {
    return subCids.indexOf(s.ci) >= 0;
  }).sort(function (a, b) {
    return a.nu - b.nu;
  }) : [];
  var selectedStudent = allStudents.find(function (s) {
    return s.id === si;
  });
  var filteredUnits = units.filter(function (u) {
    return u.bi === bi && (u.sm || 1) === sm;
  }).sort(function (a, b) {
    return a.or - b.or;
  });
  function getMemo(unitId) {
    return memos.find(function (m) {
      return m.si === si && m.ui === unitId;
    }) || null;
  }

  /* 메모 업데이트 + 즉시 localStorage 저장 (auto-save) */
  function updateMemoField(unitId, field, value) {
    var newMemos;
    var existing = memos.find(function (m) {
      return m.si === si && m.ui === unitId;
    });
    if (existing) {
      newMemos = memos.map(function (m) {
        if (m.si === si && m.ui === unitId) {
          var obj = {};
          obj[field] = value;
          return Object.assign({}, m, obj);
        }
        return m;
      });
    } else {
      var nm = {
        id: uid(),
        si: si,
        ui: unitId,
        tx: "",
        lv: ""
      };
      nm[field] = value;
      newMemos = memos.concat([nm]);
    }
    setMemos(newMemos);
    props.saveT("m", newMemos); /* 즉시 저장 */
    setSavedAt(new Date());
  }
  function onSubjectChange(e) {
    setBi(e.target.value);
    setSi("");
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "section-title"
  }, /*#__PURE__*/React.createElement("span", {
    className: "emoji"
  }, "\u270F\uFE0F"), "\uB2E8\uC6D0\uBCC4 \uBA54\uBAA8"), /*#__PURE__*/React.createElement("div", {
    className: "glass mb-16",
    style: {
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-8 items-center",
    style: {
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("select", {
    value: bi,
    onChange: onSubjectChange,
    style: {
      width: 200
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "\uACFC\uBAA9 \uC120\uD0DD"), subjects.map(function (s) {
    var cids = s.cis || (s.ci ? [s.ci] : []);
    var clNames = cids.map(function (cid) {
      var c = classes.find(function (c) {
        return c.id === cid;
      });
      return c ? c.n : "";
    }).filter(Boolean).join(", ");
    return /*#__PURE__*/React.createElement("option", {
      key: s.id,
      value: s.id
    }, s.na, " (", clNames || "미연결", ")");
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-8"
  }, /*#__PURE__*/React.createElement("button", {
    className: "num-btn" + (sm === 1 ? " active" : ""),
    style: {
      width: "auto",
      padding: "0 16px"
    },
    onClick: function () {
      setSm(1);
    }
  }, "1\uD559\uAE30"), /*#__PURE__*/React.createElement("button", {
    className: "num-btn" + (sm === 2 ? " active" : ""),
    style: {
      width: "auto",
      padding: "0 16px"
    },
    onClick: function () {
      setSm(2);
    }
  }, "2\uD559\uAE30")), /*#__PURE__*/React.createElement("select", {
    value: si,
    onChange: function (e) {
      setSi(e.target.value);
    },
    style: {
      width: 160
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "\uD559\uC0DD \uC120\uD0DD"), classStudents.map(function (s) {
    return /*#__PURE__*/React.createElement("option", {
      key: s.id,
      value: s.id
    }, s.nu, ". ", s.na);
  })), savedAt && /*#__PURE__*/React.createElement("span", {
    className: "tag tag-mint",
    style: {
      fontSize: 11,
      marginLeft: "auto"
    }
  }, "\u2713 \uC790\uB3D9 \uC800\uC7A5\uB428 \xB7 ", savedAt.toTimeString().substring(0, 5))), selectedStudent && selectedStudent.ch && /*#__PURE__*/React.createElement("div", {
    className: "tag mt-12",
    style: {
      fontSize: 13,
      padding: "6px 14px"
    }
  }, "\uD2B9\uC131: ", selectedStudent.ch)), !bi && /*#__PURE__*/React.createElement("div", {
    className: "glass text-center",
    style: {
      padding: 40
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sub"
  }, "\uACFC\uBAA9\uC744 \uBA3C\uC800 \uC120\uD0DD\uD558\uC138\uC694.")), bi && !si && classStudents.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "glass text-center",
    style: {
      padding: 40
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sub"
  }, "\uD559\uC0DD\uC744 \uC120\uD0DD\uD558\uBA74 ", sm, "\uD559\uAE30 \uB2E8\uC6D0\uBCC4 \uBA54\uBAA8\uB97C \uC791\uC131\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.")), bi && classStudents.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "glass text-center",
    style: {
      padding: 40
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sub"
  }, "\uD574\uB2F9 \uBC18\uC5D0 \uB4F1\uB85D\uB41C \uD559\uC0DD\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uBC18 \uAD00\uB9AC\uC5D0\uC11C \uD559\uC0DD\uC744 \uBA3C\uC800 \uB4F1\uB85D\uD558\uC138\uC694.")), si && filteredUnits.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, filteredUnits.map(function (u) {
    var memo = getMemo(u.id);
    var rubric = rubrics.find(function (r) {
      return r.ui === u.id;
    });
    var currentLv = memo ? memo.lv : "";
    var currentTx = memo ? memo.tx : "";
    return /*#__PURE__*/React.createElement("div", {
      key: u.id,
      className: "memo-unit-card glass"
    }, /*#__PURE__*/React.createElement("p", {
      style: {
        fontWeight: 700,
        marginBottom: 12
      }
    }, u.na), /*#__PURE__*/React.createElement("div", {
      className: "memo-unit-inner"
    }, /*#__PURE__*/React.createElement("div", {
      className: "memo-unit-left"
    }, /*#__PURE__*/React.createElement("div", {
      className: "level-btn-group"
    }, /*#__PURE__*/React.createElement("button", {
      className: "level-btn h" + (currentLv === "h" ? " active" : ""),
      onClick: function () {
        updateMemoField(u.id, "lv", "h");
      }
    }, "\uC0C1"), /*#__PURE__*/React.createElement("button", {
      className: "level-btn m" + (currentLv === "m" ? " active" : ""),
      onClick: function () {
        updateMemoField(u.id, "lv", "m");
      }
    }, "\uC911"), /*#__PURE__*/React.createElement("button", {
      className: "level-btn l" + (currentLv === "l" ? " active" : ""),
      onClick: function () {
        updateMemoField(u.id, "lv", "l");
      }
    }, "\uD558"))), /*#__PURE__*/React.createElement("div", {
      className: "memo-unit-right"
    }, /*#__PURE__*/React.createElement("textarea", {
      value: currentTx,
      onChange: function (e) {
        updateMemoField(u.id, "tx", e.target.value);
      },
      placeholder: "\uC608: 5\uAE4C\uC9C0\uB294 \uC148, \uBC1B\uC544\uC62C\uB9BC \uC544\uC9C1 \uBABB\uD568"
    }))), rubric && /*#__PURE__*/React.createElement("div", {
      className: "rubric-preview"
    }, rubric.h && /*#__PURE__*/React.createElement("div", {
      className: "rp-row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "rp-label",
      style: {
        color: "#059669"
      }
    }, "\uC0C1: "), rubric.h), rubric.m && /*#__PURE__*/React.createElement("div", {
      className: "rp-row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "rp-label",
      style: {
        color: "#d97706"
      }
    }, "\uC911: "), rubric.m), rubric.l && /*#__PURE__*/React.createElement("div", {
      className: "rp-row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "rp-label",
      style: {
        color: "#e11d48"
      }
    }, "\uD558: "), rubric.l)));
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-pink w-full",
    style: {
      marginTop: 12
    },
    onClick: function () {
      props.saveT("m", memos);
      setSavedAt(new Date());
      props.toast("저장 완료");
    }
  }, "\uD83D\uDCBE \uC804\uCCB4 \uC800\uC7A5")), si && filteredUnits.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "glass text-center",
    style: {
      padding: 40
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sub"
  }, sm, "\uD559\uAE30\uC5D0 \uB4F1\uB85D\uB41C \uB2E8\uC6D0\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E8\uC6D0/\uD3C9\uAC00\uAE30\uC900\uC5D0\uC11C \uBA3C\uC800 \uB4F1\uB85D\uD558\uC138\uC694.")));
}

/* ============================
   AI GENERATION
   ============================ */
function PageAI(props) {
  var subjects = props.loadT("b");
  var classes = props.loadT("c");
  var allStudents = props.loadT("s");
  var units = props.loadT("u");
  var rubrics = props.loadT("r");
  var memos = props.loadT("m");
  var _bi = useState("");
  var bi = _bi[0],
    setBi = _bi[1];
  var _si = useState("");
  var si = _si[0],
    setSi = _si[1];
  var _results = useState([]); /* {id, name, nu, sm, text} */
  var results = _results[0],
    setResults = _results[1];
  var _loading = useState(false);
  var loading = _loading[0],
    setLoading = _loading[1];
  var _loadingSm = useState(0); /* 현재 생성 중인 학기 (1 또는 2), 0이면 대기 */
  var loadingSm = _loadingSm[0],
    setLoadingSm = _loadingSm[1];
  var _prog = useState(null); /* 일괄 생성 진행 상황 {done, total, name} */
  var prog = _prog[0],
    setProg = _prog[1];
  var _volMode = useState("default"); /* "tiny" | "short" | "default" */
  var volMode = _volMode[0],
    setVolMode = _volMode[1];

  /* 분량 모드별 설정 */
  var VOL_CONFIG = {
    tiny: {
      label: "아주 적게",
      desc: "40자 이하 (약 120바이트)",
      minB: 60,
      maxB: 120,
      chars: "20~40자"
    },
    short: {
      label: "적게",
      desc: "80자 이하 (약 240바이트)",
      minB: 120,
      maxB: 240,
      chars: "40~80자"
    },
    "default": {
      label: "기본",
      desc: "700~900바이트 (약 230~300자)",
      minB: 700,
      maxB: 900,
      chars: "230~300자"
    }
  };
  var vol = VOL_CONFIG[volMode];

  /* AI 결과 저장/불러오기 */
  function aiResultKey() {
    return "ai_" + bi;
  }
  function loadSavedResults(subjectId) {
    if (!subjectId) return [];
    var saved = props.loadT("ai_" + subjectId);
    return saved && saved.length > 0 ? saved : [];
  }

  /* results 변경 시 자동 저장 */
  useEffect(function () {
    if (bi && results.length > 0) {
      props.saveT("ai_" + bi, results);
    }
  }, [results, bi]);

  /* 과목 변경 시 저장된 결과 불러오기 */
  function onSubjectChange(newBi) {
    setBi(newBi);
    setSi("");
    if (newBi) {
      var saved = loadSavedResults(newBi);
      setResults(saved);
    } else {
      setResults([]);
    }
  }
  var selectedSub = subjects.find(function (s) {
    return s.id === bi;
  });
  var subCids = selectedSub ? selectedSub.cis || (selectedSub.ci ? [selectedSub.ci] : []) : [];
  var classStudents = selectedSub ? allStudents.filter(function (s) {
    return subCids.indexOf(s.ci) >= 0;
  }).sort(function (a, b) {
    return a.nu - b.nu;
  }) : [];
  function getSystemPrompt() {
    var volRule = "";
    if (volMode === "tiny") {
      volRule = "[7. 분량 — 아주 짧게]\n- 1~2문장, 띄어쓰기 포함 40자(약 80바이트) 이하로 매우 간결하게 작성.\n- 핵심 수행 결과 1가지만 압축하여 기술. 수식어 완전 배제.";
    } else if (volMode === "short") {
      volRule = "[7. 분량 — 짧게]\n- 2~3문장, 띄어쓰기 포함 80자(약 160바이트) 이하로 간결하게 작성.\n- 핵심 수행 결과 2~3가지를 압축하여 기술.";
    } else {
      volRule = "[7. 분량 — UTF-8 기준 700~900바이트 엄수]\n- 반드시 700~900바이트 이내 (한글 약 230~300자).\n- 900바이트 절대 초과 금지. 900바이트에 가까울수록 좋음.\n- 불필요한 수식어·중복 표현 제거. 핵심 행동과 도달 수준 중심으로 압축.";
    }
    return "당신은 특수학교 교과학습발달상황 작성 전문가입니다. 통지표에 그대로 나가는 공식 기록이므로 다음 원칙을 엄격히 지킵니다.\n\n[1. 문장 종결 — 완결형 명사형]\n- 모든 문장은 '~함', '~임'으로 끝낸다. 진행형 '~하고 있음'은 절대 금지.\n  - (X) 관찰하고 있음 → (O) 관찰함\n  - (X) 참여함을 보임 → (O) 참여함\n\n[2. 관찰자 시점 금지 — 학생 주체 능동형]\n- '~보임', '~것으로 나타남', '~모습이 관찰됨' 등 관찰자 시점 표현 전면 금지.\n- 학생을 주어로 한 능동형 동사로만 기술한다: 관찰함, 탐색함, 응시함, 선택함, 표현함, 구분함, 조작함, 참여함, 경험함, 접촉함, 시도함, 수행함, 완성함 등.\n  - (X) 흥미를 보임 → (O) 흥미를 가지고 참여함\n  - (X) 집중하는 모습이 관찰됨 → (O) 끝까지 집중하여 과제를 완성함\n\n[3. 부정 서술 배제 — 할 수 있는 것 중심]\n- '부족함', '미흡함', '어려워함', '못함', '하지 못함' 등 학생의 결손·결핍을 드러내는 서술 금지.\n- 학생이 실제로 수행한 것, 도달한 수준, 참여한 활동을 중심으로 긍정적으로 기술.\n- '하' 수준 학생도 참여·경험·접촉·탐색·반응 등 능동적 행동이 있으므로, 그 행동을 주어로 삼아 서술.\n  - (X) 덧셈을 어려워하나 단순 수세기는 가능함 → (O) 10 이내의 수를 세고 구체물을 수 순서에 맞게 배열함\n\n[4. 교사 개입 표현 처리 — 기본 제거, 불가피 시 '촉진']\n- 원칙적으로 '교사의 도움을 받아', '교사와 함께', '신체적 보조', '교사가 손을 잡고' 등 교사 개입 문구는 전부 삭제하고, 학생이 최종적으로 수행한 행동만 기술한다.\n  - (X) 교사의 손을 잡고 공을 굴림 → (O) 공을 앞쪽 방향으로 굴림\n  - (X) 교사와 함께 색칠함 → (O) 색연필로 도형 안을 색칠함\n- 도움을 빼면 서술이 성립하지 않는 경우에만 예외적으로 '~ 촉진'이라는 전문 용어로 바꿔 사용 가능: '신체적 촉진', '언어적 촉진', '시각적 촉진', '몸짓 촉진' 등. 단, 남용 금지.\n  - (X) 교사의 도움을 받아 숟가락을 잡음 → (O) 신체적 촉진을 통해 숟가락을 바르게 쥐고 음식물을 입으로 옮김\n\n[5. 상호명·외래어 순화]\n- 특정 상호·브랜드명 사용 금지. 일반 명사로 대체.\n  - 유튜브 → 동영상 공유 서비스 / 카카오톡 → 메신저 / 네이버 → 포털 사이트\n- 외래어·외국어 표현은 되도록 사용하지 않고 우리말로 순화한다. 일반적으로 통용되는 우리말이 있는 경우 반드시 우리말을 우선 사용.\n  - (X) 컬러 → (O) 색깔 / (X) 체크함 → (O) 확인함 / (X) 미션 → (O) 과제\n  - (X) 테이블 → (O) 책상 / (X) 스티커 → (O) 붙임 딱지 / (X) 게임 → (O) 놀이\n  - 단, 해당 우리말 표현이 어색하거나 해당 맥락에서 뜻이 불분명한 경우에 한해 외래어 허용.\n\n[6. 내용 구성 — 평가기준 골격 + 메모 구체화]\n- 교사가 선택한 도달 수준(상/중/하)에 해당하는 평가기준 문구를 핵심 골격으로 삼는다.\n- 교사 메모의 구체적 행동·수행 내용을 자연스럽게 녹여 서술한다.\n- 메모가 비문이거나 구어체여도 의도를 파악하여 정제된 문장으로 변환.\n- 학생 특성을 고려해 서술의 톤과 초점을 조절한다.\n- 학생마다 표현·어휘·문장 구성을 다르게 하여 기계적 반복을 피한다.\n\n" + volRule + "\n\n[8. 출력 형식]\n- 서두·마무리 인사 없이 본문 서술만 출력한다.\n- '다음과 같음', '아래와 같이', '정리하면' 등 메타 문구 금지.\n- 제목, 불릿, 번호, 줄바꿈 구분 없이 하나의 서술 문단으로 출력한다.";
  }
  function buildPrompt(student, semester) {
    var subUnits = units.filter(function (u) {
      return u.bi === bi && (u.sm || 1) === semester;
    }).sort(function (a, b) {
      return a.or - b.or;
    });
    var lines = [];
    lines.push("학생: " + student.na + " " + student.nu + "번");
    lines.push("특성: " + (student.ch || "없음"));
    lines.push("과목: " + (selectedSub ? selectedSub.na : ""));
    lines.push("학기: " + semester + "학기");
    lines.push("");
    subUnits.forEach(function (u) {
      var memo = memos.find(function (m) {
        return m.si === student.id && m.ui === u.id;
      });
      var rubric = rubrics.find(function (r) {
        return r.ui === u.id;
      });
      var lvLabel = "";
      if (memo && memo.lv === "h") lvLabel = "상";else if (memo && memo.lv === "m") lvLabel = "중";else if (memo && memo.lv === "l") lvLabel = "하";
      lines.push("[단원: " + u.na + "]");
      lines.push("교사 판단 도달수준: " + (lvLabel || "미선택"));
      lines.push("평가기준 상: " + (rubric ? rubric.h : "미등록"));
      lines.push("평가기준 중: " + (rubric ? rubric.m : "미등록"));
      lines.push("평가기준 하: " + (rubric ? rubric.l : "미등록"));
      lines.push("교사 메모: " + (memo ? memo.tx : "없음"));
      lines.push("");
    });
    var volInstruction = "";
    if (volMode === "tiny") {
      volInstruction = "위 자료로 " + semester + "학기 교과학습발달상황을 작성. 띄어쓰기 포함 40자 이하, 1~2문장으로 매우 간결하게.";
    } else if (volMode === "short") {
      volInstruction = "위 자료로 " + semester + "학기 교과학습발달상황을 작성. 띄어쓰기 포함 80자 이하, 2~3문장으로 간결하게.";
    } else {
      volInstruction = "위 자료로 " + semester + "학기 교과학습발달상황을 작성. UTF-8 기준 700~900바이트(한글 약 230~300자) 이내 엄수.";
    }
    lines.push(volInstruction);
    return lines.join("\n");
  }
  function callAI(student, semester) {
    var subUnits = units.filter(function (u) {
      return u.bi === bi && (u.sm || 1) === semester;
    });
    if (subUnits.length === 0) {
      return Promise.resolve("[생성 불가] " + semester + "학기에 등록된 단원이 없습니다.");
    }
    return fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-app-token": APP_TOKEN
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 800,
        system: getSystemPrompt(),
        messages: [{
          role: "user",
          content: buildPrompt(student, semester)
        }]
      })
    }).then(function (res) {
      return res.json();
    }).then(function (data) {
      if (data.content && data.content[0] && data.content[0].text) {
        return data.content[0].text.trim();
      }
      if (data.error) {
        return "[오류] " + (data.error.message || JSON.stringify(data.error));
      }
      return "[오류] 응답을 받지 못했습니다.";
    }).catch(function (err) {
      return "[오류] " + err.message;
    });
  }
  function generateSingle(semester) {
    if (!si) {
      props.toast("학생을 선택하세요");
      return;
    }
    var student = allStudents.find(function (s) {
      return s.id === si;
    });
    if (!student) return;
    setLoading(true);
    setLoadingSm(semester);
    /* 기존 결과 중 같은 학생·같은 학기만 제거하고 유지 */
    setResults(function (prev) {
      return prev.filter(function (r) {
        return !(r.id === student.id && r.sm === semester);
      });
    });
    callAI(student, semester).then(function (text) {
      setResults(function (prev) {
        return prev.concat([{
          id: student.id,
          name: student.na,
          nu: student.nu,
          sm: semester,
          text: text
        }]);
      });
      setLoading(false);
      setLoadingSm(0);
    });
  }

  /* 이미 정상 생성된 결과가 있는 학생인지. 오류·생성불가는 다시 만들어야 하므로 제외 */
  function hasGoodResult(studentId, semester) {
    var r = results.find(function (x) {
      return x.id === studentId && x.sm === semester;
    });
    if (!r) return false;
    var t = (r.text || "").trim();
    return !!t && t.indexOf("[오류]") !== 0 && t.indexOf("[생성 불가]") !== 0 && t !== "생성 중...";
  }
  function generateAll(semester) {
    if (classStudents.length === 0) {
      props.toast("학생이 없습니다");
      return;
    }

    /* 이미 만들어 둔 학생은 건너뛴다. 같은 내용을 다시 만들면 API 사용량만 낭비된다.
       다시 만들고 싶으면 학생별 [재생성] 이나 [전체 결과 초기화] 를 쓴다. */
    var todo = classStudents.filter(function (s) {
      return !hasGoodResult(s.id, semester);
    });
    var skipped = classStudents.length - todo.length;
    if (todo.length === 0) {
      props.toast(semester + "학기는 이미 " + classStudents.length + "명 모두 생성되어 있습니다");
      return;
    }
    setLoading(true);
    setLoadingSm(semester);
    /* 다시 만들 학생의 이전(오류) 결과만 제거하고 나머지는 보존 */
    var todoIds = todo.map(function (s) {
      return s.id;
    });
    setResults(function (prev) {
      return prev.filter(function (r) {
        return !(r.sm === semester && todoIds.indexOf(r.id) >= 0);
      });
    });
    var idx = 0;
    setProg({
      done: 0,
      total: todo.length,
      name: todo[0].na
    });
    function next() {
      if (idx >= todo.length) {
        setLoading(false);
        setLoadingSm(0);
        setProg(null);
        props.toast(todo.length + "명 생성 완료" + (skipped > 0 ? " · " + skipped + "명은 이미 있어 건너뜀" : ""));
        return;
      }
      var student = todo[idx];
      idx++;
      setProg({
        done: idx - 1,
        total: todo.length,
        name: student.na
      });
      callAI(student, semester).then(function (text) {
        setResults(function (prev) {
          return prev.concat([{
            id: student.id,
            name: student.na,
            nu: student.nu,
            sm: semester,
            text: text
          }]);
        });
        next();
      });
    }
    next();
  }
  function updateResultText(rid, rsm, text) {
    setResults(function (prev) {
      return prev.map(function (r) {
        if (r.id === rid && r.sm === rsm) return Object.assign({}, r, {
          text: text
        });
        return r;
      });
    });
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        props.toast("복사 완료");
      }).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      props.toast("복사 완료");
    } catch (e) {
      props.toast("복사 실패 — 수동으로 복사하세요");
    }
    document.body.removeChild(ta);
  }
  function copyAllOfSemester(semester) {
    var all = results.filter(function (r) {
      return r.sm === semester;
    }).sort(function (a, b) {
      return a.nu - b.nu;
    }).map(function (r) {
      return r.nu + ". " + r.name + "\n" + r.text;
    }).join("\n\n---\n\n");
    copyText(all);
  }

  /* 나이스 자동입력 확장용 JSON 복사.
     확장은 성명으로 행을 찾고, 동명이인일 때만 번호(num)로 좁힌다. */
  function copyForNeis(semester) {
    var bad = 0;
    var items = results.filter(function (r) {
      return r.sm === semester;
    }).filter(function (r) {
      var t = (r.text || "").trim();
      if (!t || t.indexOf("[생성 불가]") === 0 || t.indexOf("[오류]") === 0 || t === "생성 중...") {
        bad++;
        return false;
      }
      return true;
    }).sort(function (a, b) {
      return a.nu - b.nu;
    }).map(function (r) {
      return {
        name: r.name,
        num: String(r.nu),
        text: r.text.trim()
      };
    });
    if (items.length === 0) {
      props.toast("복사할 결과가 없습니다");
      return;
    }
    copyText(JSON.stringify(items, null, 2));
    if (bad > 0) props.toast(bad + "명은 생성 실패라 제외했습니다");
  }
  function regenerateSingle(studentId, semester) {
    var student = allStudents.find(function (s) {
      return s.id === studentId;
    });
    if (!student) return;
    setResults(function (prev) {
      return prev.map(function (r) {
        if (r.id === studentId && r.sm === semester) return Object.assign({}, r, {
          text: "생성 중..."
        });
        return r;
      });
    });
    callAI(student, semester).then(function (text) {
      setResults(function (prev) {
        return prev.map(function (r) {
          if (r.id === studentId && r.sm === semester) return Object.assign({}, r, {
            text: text
          });
          return r;
        });
      });
    });
  }
  function clearResults() {
    setResults([]);
    if (bi) props.saveT("ai_" + bi, []);
    props.toast("결과를 모두 지웠습니다");
  }
  function removeResult(studentId, semester) {
    setResults(function (prev) {
      return prev.filter(function (r) {
        return !(r.id === studentId && r.sm === semester);
      });
    });
  }

  /* 학기별 데이터 준비도 체크 */
  function checkReadiness(semester) {
    var subUnits = units.filter(function (u) {
      return u.bi === bi && (u.sm || 1) === semester;
    });
    if (subUnits.length === 0) return {
      unitCount: 0,
      rubricCount: 0,
      studentsWithData: 0
    };
    var rubricIds = rubrics.filter(function (r) {
      return subUnits.some(function (u) {
        return u.id === r.ui;
      });
    }).map(function (r) {
      return r.ui;
    });
    var studentsWithData = classStudents.filter(function (s) {
      return subUnits.some(function (u) {
        return memos.some(function (m) {
          return m.si === s.id && m.ui === u.id && (m.tx || m.lv);
        });
      });
    }).length;
    return {
      unitCount: subUnits.length,
      rubricCount: rubricIds.length,
      studentsWithData: studentsWithData
    };
  }
  var ready1 = bi ? checkReadiness(1) : null;
  var ready2 = bi ? checkReadiness(2) : null;

  /* 학기별 결과 그룹핑 */
  var results1 = results.filter(function (r) {
    return r.sm === 1;
  }).sort(function (a, b) {
    return a.nu - b.nu;
  });
  var results2 = results.filter(function (r) {
    return r.sm === 2;
  }).sort(function (a, b) {
    return a.nu - b.nu;
  });
  function renderResultCard(r) {
    var bytes = countBytes(r.text);
    var over = bytes > vol.maxB;
    var under = bytes < vol.minB && !r.text.startsWith("[");
    return /*#__PURE__*/React.createElement("div", {
      key: r.id + "-" + r.sm,
      className: "ai-result-card glass"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between"
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 700
      }
    }, r.nu, ". ", r.name, " ", /*#__PURE__*/React.createElement("span", {
      className: "tag",
      style: {
        marginLeft: 8
      }
    }, r.sm, "\uD559\uAE30")), /*#__PURE__*/React.createElement("div", {
      className: "flex gap-8"
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm",
      onClick: function () {
        copyText(r.text);
      }
    }, "\uBCF5\uC0AC"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-lavender btn-sm",
      onClick: function () {
        regenerateSingle(r.id, r.sm);
      }
    }, "\uC7AC\uC0DD\uC131"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-red btn-sm",
      onClick: function () {
        removeResult(r.id, r.sm);
      }
    }, "\u2715"))), /*#__PURE__*/React.createElement("textarea", {
      value: r.text,
      onChange: function (e) {
        updateResultText(r.id, r.sm, e.target.value);
      }
    }), /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between",
      style: {
        fontSize: 12,
        marginTop: 4
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: over ? "#e11d48" : under ? "#d97706" : "#059669",
        fontWeight: 600
      }
    }, bytes, " / ", vol.maxB, " \uBC14\uC774\uD2B8 ", over ? "⚠ 초과" : under ? "(분량 부족)" : "✓"), /*#__PURE__*/React.createElement("span", {
      className: "text-sub"
    }, "\uAD8C\uC7A5 ", vol.minB, "~", vol.maxB, "\uBC14\uC774\uD2B8")));
  }
  function renderSemesterBlock(semester, resultArr) {
    if (resultArr.length === 0) return null;
    return /*#__PURE__*/React.createElement("div", {
      className: "mb-24"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between mb-12"
    }, /*#__PURE__*/React.createElement("h3", {
      style: {
        fontSize: 18,
        fontWeight: 700
      }
    }, "\uD83D\uDCDA ", semester, "\uD559\uAE30 \uACB0\uACFC (", resultArr.length, "\uBA85)"), /*#__PURE__*/React.createElement("div", {
      className: "flex",
      style: {
        gap: 6
      }
    }, resultArr.length > 1 && /*#__PURE__*/React.createElement("button", {
      className: "btn btn-mint btn-sm",
      onClick: function () {
        copyAllOfSemester(semester);
      }
    }, semester, "\uD559\uAE30 \uC804\uCCB4 \uBCF5\uC0AC"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-sm",
      style: {
        background: "#0f766e",
        color: "#fff"
      },
      title: "\uB098\uC774\uC2A4 \uC790\uB3D9\uC785\uB825 \uD655\uC7A5\uC5D0 \uBD99\uC5EC\uB123\uC744 JSON\uC744 \uBCF5\uC0AC\uD569\uB2C8\uB2E4",
      onClick: function () {
        copyForNeis(semester);
      }
    }, "\uD83D\uDCCB [\uB098\uC774\uC2A4] \uBCF5\uC0AC"))), resultArr.map(renderResultCard));
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "section-title"
  }, /*#__PURE__*/React.createElement("span", {
    className: "emoji"
  }, "\uD83E\uDD16"), "\uAD50\uACFC\uD559\uC2B5\uBC1C\uB2EC\uC0C1\uD669"), /*#__PURE__*/React.createElement("div", {
    className: "glass mb-16",
    style: {
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-8 items-center mb-12",
    style: {
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("select", {
    value: bi,
    onChange: function (e) {
      onSubjectChange(e.target.value);
    },
    style: {
      width: 200
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "\uACFC\uBAA9 \uC120\uD0DD"), subjects.map(function (s) {
    var cids = s.cis || (s.ci ? [s.ci] : []);
    var clNames = cids.map(function (cid) {
      var c = classes.find(function (c) {
        return c.id === cid;
      });
      return c ? c.n : "";
    }).filter(Boolean).join(", ");
    return /*#__PURE__*/React.createElement("option", {
      key: s.id,
      value: s.id
    }, s.na, " (", clNames || "미연결", ")");
  })), /*#__PURE__*/React.createElement("select", {
    value: si,
    onChange: function (e) {
      setSi(e.target.value);
    },
    style: {
      width: 160
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "\uD559\uC0DD \uC120\uD0DD"), classStudents.map(function (s) {
    return /*#__PURE__*/React.createElement("option", {
      key: s.id,
      value: s.id
    }, s.nu, ". ", s.na);
  }))), bi && (ready1 || ready2) && /*#__PURE__*/React.createElement("div", {
    className: "flex gap-8 mb-12",
    style: {
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "tag " + (ready1 && ready1.unitCount > 0 && ready1.studentsWithData > 0 ? "tag-mint" : "tag-amber")
  }, "1\uD559\uAE30 \xB7 \uB2E8\uC6D0 ", ready1 ? ready1.unitCount : 0, "\uAC1C \xB7 \uD3C9\uAC00\uAE30\uC900 ", ready1 ? ready1.rubricCount : 0, "\uAC1C \xB7 \uBA54\uBAA8\uC791\uC131 \uD559\uC0DD ", ready1 ? ready1.studentsWithData : 0, "\uBA85"), /*#__PURE__*/React.createElement("span", {
    className: "tag " + (ready2 && ready2.unitCount > 0 && ready2.studentsWithData > 0 ? "tag-mint" : "tag-amber")
  }, "2\uD559\uAE30 \xB7 \uB2E8\uC6D0 ", ready2 ? ready2.unitCount : 0, "\uAC1C \xB7 \uD3C9\uAC00\uAE30\uC900 ", ready2 ? ready2.rubricCount : 0, "\uAC1C \xB7 \uBA54\uBAA8\uC791\uC131 \uD559\uC0DD ", ready2 ? ready2.studentsWithData : 0, "\uBA85")), /*#__PURE__*/React.createElement("div", {
    className: "mb-12"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm mb-8",
    style: {
      fontWeight: 600,
      color: "var(--text-sub)"
    }
  }, "\uBD84\uB7C9 \uC120\uD0DD"), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-8",
    style: {
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "num-btn" + (volMode === "tiny" ? " active" : ""),
    style: {
      width: "auto",
      padding: "0 16px",
      fontSize: 13,
      height: 38
    },
    onClick: function () {
      setVolMode("tiny");
    }
  }, "\uC544\uC8FC \uC801\uAC8C (40\uC790)"), /*#__PURE__*/React.createElement("button", {
    className: "num-btn" + (volMode === "short" ? " active" : ""),
    style: {
      width: "auto",
      padding: "0 16px",
      fontSize: 13,
      height: 38
    },
    onClick: function () {
      setVolMode("short");
    }
  }, "\uC801\uAC8C (80\uC790)"), /*#__PURE__*/React.createElement("button", {
    className: "num-btn" + (volMode === "default" ? " active" : ""),
    style: {
      width: "auto",
      padding: "0 16px",
      fontSize: 13,
      height: 38
    },
    onClick: function () {
      setVolMode("default");
    }
  }, "\uAE30\uBCF8 (230~300\uC790)")), /*#__PURE__*/React.createElement("p", {
    className: "text-sm mt-12",
    style: {
      color: "var(--text-sub)"
    }
  }, vol.desc)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm mb-8",
    style: {
      fontWeight: 600,
      color: "var(--text-sub)"
    }
  }, "\uAC1C\uBCC4 \uC0DD\uC131 (\uC120\uD0DD\uD55C \uD559\uC0DD 1\uBA85)"), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-8"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-pink",
    onClick: function () {
      generateSingle(1);
    },
    disabled: loading
  }, loading && loadingSm === 1 ? /*#__PURE__*/React.createElement("span", {
    className: "spinner"
  }) : "📝", " 1\uD559\uAE30 \uC0DD\uC131"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-pink",
    onClick: function () {
      generateSingle(2);
    },
    disabled: loading
  }, loading && loadingSm === 2 ? /*#__PURE__*/React.createElement("span", {
    className: "spinner"
  }) : "📝", " 2\uD559\uAE30 \uC0DD\uC131"))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      paddingTop: 16,
      borderTop: "1px solid var(--card-border)"
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm mb-8",
    style: {
      fontWeight: 600,
      color: "var(--text-sub)"
    }
  }, "\uC804\uCCB4 \uC77C\uAD04 (", classStudents.length, "\uBA85 \xB7 \uD574\uB2F9 \uD559\uAE30)"), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-8"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-lavender",
    onClick: function () {
      generateAll(1);
    },
    disabled: loading
  }, loading && loadingSm === 1 ? /*#__PURE__*/React.createElement("span", {
    className: "spinner"
  }) : "📋", " 1\uD559\uAE30 \uC804\uCCB4 \uC77C\uAD04"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-lavender",
    onClick: function () {
      generateAll(2);
    },
    disabled: loading
  }, loading && loadingSm === 2 ? /*#__PURE__*/React.createElement("span", {
    className: "spinner"
  }) : "📋", " 2\uD559\uAE30 \uC804\uCCB4 \uC77C\uAD04")))), loading && /*#__PURE__*/React.createElement("div", {
    className: "glass text-center",
    style: {
      padding: 40
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "spinner",
    style: {
      width: 32,
      height: 32,
      marginBottom: 12
    }
  }), prog ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      fontWeight: 700
    }
  }, loadingSm, "\uD559\uAE30 \uC0DD\uC131 \uC911 \xB7 ", prog.done + 1, " / ", prog.total, "\uBA85"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-sub",
    style: {
      marginTop: 4
    }
  }, prog.name, " \uD559\uC0DD \uC791\uC131 \uC911\u2026"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      height: 6,
      borderRadius: 3,
      background: "rgba(15,118,110,0.15)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: Math.round(prog.done / prog.total * 100) + "%",
      background: "var(--pink)",
      transition: "width .3s"
    }
  })), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-sub",
    style: {
      marginTop: 10
    }
  }, "\uCC3D\uC744 \uB2EB\uC9C0 \uB9C8\uC138\uC694. \uD55C \uBA85\uC529 \uCC28\uB840\uB85C \uB9CC\uB4ED\uB2C8\uB2E4.")) : /*#__PURE__*/React.createElement("p", null, loadingSm, "\uD559\uAE30 \uC0DD\uC131 \uC911...")), results.length > 0 && !loading && /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mb-12"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tag tag-mint",
    style: {
      fontSize: 11
    }
  }, "\uD83D\uDCBE \uACB0\uACFC \uC790\uB3D9 \uC800\uC7A5\uB428 \xB7 ", results.length, "\uAC74"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: clearResults
  }, "\uC804\uCCB4 \uACB0\uACFC \uCD08\uAE30\uD654")), renderSemesterBlock(1, results1), renderSemesterBlock(2, results2));
}

/* ============================
   RENDER
   ============================ */
var root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));