// background.js - Safe Port Relay

const panelPorts = new Map();

chrome.runtime.onConnect.addListener((port) => {
    if (!port.name.startsWith("panel-")) return;
    const tabId = Number(port.name.replace("panel-", ""));
    panelPorts.set(tabId, port);

    port.onMessage.addListener((msg) => {
        chrome.tabs.sendMessage(tabId, msg, () => {
            if (chrome.runtime.lastError) {
                // Silent fail if tab is gone
            }
        });
    });

    port.onDisconnect.addListener(() => panelPorts.delete(tabId));
});

chrome.tabs.onRemoved.addListener((tabId) => panelPorts.delete(tabId));

chrome.runtime.onMessage.addListener((msg, sender) => {
    if (sender.tab?.id && panelPorts.has(sender.tab.id)) {
        try {
            panelPorts.get(sender.tab.id).postMessage(msg);
        } catch (e) {
            panelPorts.delete(sender.tab.id);
        }
    }
});