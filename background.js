chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});
chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'openOptions') {
    chrome.runtime.openOptionsPage().catch(err => console.error('Could not open options:', err));
    return false;
  }
});
