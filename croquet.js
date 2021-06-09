/* globals Croquet */

class ClimateModel extends Croquet.Model {
    init(options, persisted) {
        super.init(options, persisted);

        this.disruptor = null; // {x, y} or null
        this.isFullScreen = false;

        this.subscribe(this.id, 'addDisruptor', this.addDisruptor);
        this.subscribe(this.id, 'setFullScreen', this.setFullScreen);
        this.subscribe(this.id, 'slideDissolve', this.setSlideDissolve);
    }

    addDisruptor(data) {
        this.disruptor = data;
        this.publish(this.id, "disruptorUpdated");
    }

    setFullScreen(flag) {
        if (this.isFullScreen !== flag) {
            this.isFullScreen = flag;
            this.publish(this.id, "fullScreenUpdated");
        }
    }

    setSlideDissolve(flag) {
        if (flag) {
            this.publish(this.id, "slideDissolveUpdated");
        }
    }
}

ClimateModel.register("ClimateModel");

class ClimateView extends Croquet.View {
    constructor(model) {
        super(model);
        this.model = model;

        Croquet.Messenger.setReceiver(this);
        Croquet.Messenger.on("appInfoRequest", "handleAppInfoRequest");
        Croquet.Messenger.send("appReady");
        Croquet.Messenger.startPublishingPointerMove();

        this.subscribe(this.model.id, "disruptorUpdated", this.disruptorUpdated);
        this.subscribe(this.model.id, "fullScreenUpdated", this.fullScreenUpdated);
        this.subscribe(this.model.id, "slideDissolveUpdated", this.slideDissolveUpdated);
    }

    setShadama(shadama) {
        this.shadama = shadama;
        this.disruptorUpdated();
        this.fullScreenUpdated();
    }

    updateFullScreen(flag) {
        this.publish(this.model.id, "setFullScreen", flag);
    }

    publishMessage(name, v1, v2) {
        if (name === "eddy") {
            this.publish(this.model.id, "addDisruptor", {x: v1, y: v2});
        }
        if (name === "slideDissolve") {
            this.publish(this.model.id, "slideDissolve", true);
        }
    }

    disruptorUpdated() {
        let eddyX;
        let eddyY;
        if (this.shadama) {
            let d = this.model.disruptor;
            let time = this.shadama.env["time"];
            if (d === null) {
                eddyX = 0;
                eddyY = 0;
            } else {
                eddyX = d.x;
                eddyY = d.y;
            }
            this.shadama.setVariable("eddyX", eddyX);
            this.shadama.setVariable("eddyY", eddyY);
            this.shadama.setVariable("mousedown", {x: 0, y: 0, time});
        }
    }

    fullScreenUpdated() {
        if (this.shadama) {
            this.shadama.setClimateFullScreen(this.model.isFullScreen);
        }
    }

    slideDissolveUpdated() {
        if (this.shadama && this.shadama.env["slideDissolve"] === 0) {
            this.shadama.setVariable("slideDissolve", 1);
        }
    }

    handleAppInfoRequest() {
        Croquet.Messenger.send("appInfo", { appName: "shadama-climate", label: "shadama", iconName: "whiteboard.svgIcon", urlTemplate: "https://tinlizzie.org/~ohshima/shadama?climatedemo&q=${q}", transparent: true });
    }
}

export function join() {
    const joinArgs = {
        appId: 'io.croquet.shadama.climate',
        name: Croquet.App.autoSession("q"),
        password: 'dummy-pass',
        model: ClimateModel,
        view: ClimateView,
        autoSleep: false,
        tps: 0,
    };

    return Croquet.Session.join(joinArgs);
}
