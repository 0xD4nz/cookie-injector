// Background service worker
// On Android: directly open extension as full tab (skip popup entirely)

const isAndroid = /Android/i.test(navigator.userAgent);

if (isAndroid) {
    // Remove popup so onClicked fires
    chrome.action.setPopup({ popup: '' });
}

// When popup is disabled (Android), clicking icon opens full tab with target tabId
chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.create({
        url: chrome.runtime.getURL(`popup.html?mode=tab&tabId=${tab.id}`)
    });
});
