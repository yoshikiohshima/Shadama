/* globals Croquet */

export class MessengerClient {
    constructor() {
        Croquet.Messenger.setReceiver(this);
        Croquet.Messenger.on("appInfoRequest", "handleAppInfoRequest");
        Croquet.Messenger.send("appReady");
    }

    handleAppInfoRequest(data) {
        Croquet.Messenger.send("appInfo", { appName: "shadama-climate", label: "shadama", iconName: "whiteboard.svgIcon", urlTemplate: "https://tinlizzie.org/~ohshima/shadama?climatedemo&q=${q}", transparent: true })
    }
}
        
