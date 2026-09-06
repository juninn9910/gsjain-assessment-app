/* 도구 모음 아이콘을 누르면 사이드 패널이 열리고, 다시 누르면 닫힌다.
   팝업과 달리 페이지를 클릭해도 닫히지 않아 입력 중에도 진행 상황을 볼 수 있다. */
chrome.runtime.onInstalled.addListener(function () {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch(function () { /* 구버전 브라우저 무시 */ });
  }
});

/* 서비스 워커가 잠들었다 깨어난 경우에도 동작하도록 시작 시 한 번 더 */
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(function () {});
}
