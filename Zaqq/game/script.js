"use strict";
console.clear();
class U {
}
//utilities 
U.randomFromRange = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
U.colors = ['#0F5257', '#FF6978', '#A7FFF6', '#507DBC', '#98DFEA', '#69FFF1', '#EEEEEE', '#FFFFFF', '#EEEEEE', '#FFFFFF'];
U.translate = (x = 0, y = 0) => `translate(${x}, ${y})`;
U.within = (min, target, max) => Math.min(Math.max(min, target), max);
U.mouseEventToCoordinate = mouseEvent => { return { x: mouseEvent.clientX, y: mouseEvent.clientY }; };
U.touchEventToCoordinate = touchEvent => { return { x: touchEvent.changedTouches[0].clientX, y: touchEvent.changedTouches[0].clientY }; };
U.createPath = (points, offset = { x: 0, y: 0 }, percentageContainer) => {
    let path = '';
    for (let i = 0; i < points.length; i++) {
        let p = points[i];
        path += (p.type ? p.type : (i == 0 ? '' : ', '));
        if (percentageContainer)
            path += (offset.x + (p.x / 100) * percentageContainer.width) + ' ' + (offset.y + (p.y / 100) * percentageContainer.height);
        else
            path += (offset.x + p.x) + ' ' + (offset.y + p.y);
    }
    return path;
};
class Game {
    constructor() {
        // CONSTS
        this.GAME_LENGTH_SECONDS = 1000;
        this.PLAYER_SPEED = 12;
        this.PLAYER_SPEED_STEP = 1;
        this.width = 0;
        this.height = 0;
        this.ghosts = [];
        this.stagePadding = 20;
        this.started = false;
        this.playerCurrentSpeed = 0;
        this.playerTargetSpeed = 0;
        this.goLeft = () => this.setPlayerDirection(-this.PLAYER_SPEED, true);
        this.stopLeft = () => this.setPlayerDirection(-this.PLAYER_SPEED);
        this.goRight = () => this.setPlayerDirection(this.PLAYER_SPEED, true);
        this.stopRight = () => this.setPlayerDirection(this.PLAYER_SPEED);
        this.container = document.getElementById('container');
        this.stage = Snap('#svg');
        this.player = new Player(this.stage);
        this.onResize();
        let pad = (this.stagePadding * 2);
        for (let i = 0; i < 5; i++)
            this.ghosts.push(new Ghost(this.stage, this.stagePadding + Math.round(Math.random() * (this.width - pad)), this.stagePadding + Math.round(Math.random() * (this.height * 0.7 - pad))));
        this.resize = Rx.Observable.fromEvent(window, "resize");
        this.resize.subscribe(() => this.onResize());
        // setup keyboard inputs
        let keyDowns = Rx.Observable.fromEvent(document, "keydown");
        let keyUps = Rx.Observable.fromEvent(document, "keyup");
        this.keyPress = keyDowns.merge(keyUps)
            .filter(e => ['arrowright', 'arrowleft', 'a', 'd'].indexOf(e.key.toLowerCase()) >= 0)
            .groupBy(e => e.keyCode)
            .map(group => group.distinctUntilChanged(null, e => e.type))
            .mergeAll();
        // setup mouse inputs
        let mouseDowns = Rx.Observable.fromEvent(document, "mousedown").map(U.mouseEventToCoordinate);
        let mouseMoves = Rx.Observable.fromEvent(window, "mousemove").map(U.mouseEventToCoordinate);
        let mouseUps = Rx.Observable.fromEvent(window, "mouseup").map(U.mouseEventToCoordinate);
        let touchStarts = Rx.Observable.fromEvent(document, "touchstart").map(U.touchEventToCoordinate);
        let touchMoves = Rx.Observable.fromEvent(document, "touchmove").map(U.touchEventToCoordinate);
        let touchEnds = Rx.Observable.fromEvent(window, "touchend").map(U.touchEventToCoordinate);
        this.mouseDown = mouseDowns.merge(touchStarts);
        this.mouseMove = mouseMoves.merge(touchMoves);
        this.mouseUp = mouseUps.merge(touchEnds);
    }
    onResize() {
        this.width = this.container.offsetWidth;
        this.height = this.container.offsetHeight;
        this.stage.attr({
            width: this.width,
            height: this.height
        });
        this.player.setY(this.height);
    }
    start() {
        console.log('Game on!');
        //reset play position
        this.player.setX((this.width - this.player.width) / 2);
        this.keyPressSubscription = this.keyPress.subscribe(e => {
            let type = e.type === 'keydown' ? 'go' : 'stop';
            if (['arrowleft', 'a'].indexOf(e.key.toLowerCase()) >= 0) {
                this[type + 'Left']();
            }
            if (['arrowright', 'd'].indexOf(e.key.toLowerCase()) >= 0) {
                this[type + 'Right']();
            }
        });
        this.mouseDownSubscription = this.mouseDown.subscribe(e => {
            if (this.stream)
                this.stream.kill();
            this.stream = new Stream(this.stage);
            this.stream.setTarget(e);
        });
        this.mouseMoveSubscription = this.mouseMove.subscribe(e => {
            if (this.stream)
                this.stream.setTarget(e);
            if (this.caughtGhost)
                this.caughtGhost.setTarget(e);
        });
        this.mouseUpSubscription = this.mouseUp.subscribe(e => {
            if (this.stream)
                this.stream.kill();
            if (this.caughtGhost)
                this.caughtGhost.clearTarget();
            this.caughtGhost = null;
            this.stream = null;
        });
        window.requestAnimationFrame((t) => { this.tick(t); });
    }
    setPlayerDirection(direction, go = false) {
        if (go)
            this.playerTargetSpeed = direction;
        else if (this.playerTargetSpeed == direction)
            this.playerTargetSpeed = 0;
    }
    end() {
        console.warn('Game over');
        if (this.keyPressSubscription)
            this.keyPressSubscription.unsubscribe();
        if (this.mouseDownSubscription)
            this.mouseDownSubscription.unsubscribe();
        if (this.mouseMoveSubscription)
            this.mouseMoveSubscription.unsubscribe();
        if (this.mouseUpSubscription)
            this.mouseUpSubscription.unsubscribe();
    }
    tick(timestamp) {
        if (!this.startTimestamp)
            this.startTimestamp = timestamp;
        let progress = timestamp - this.startTimestamp;
        if (this.playerCurrentSpeed > this.playerTargetSpeed)
            this.playerCurrentSpeed -= this.PLAYER_SPEED_STEP;
        if (this.playerCurrentSpeed < this.playerTargetSpeed)
            this.playerCurrentSpeed += this.PLAYER_SPEED_STEP;
        let targetX = this.player.x + this.playerCurrentSpeed;
        let actualX = U.within(0, targetX, this.width - this.player.width);
        this.player.setX(actualX);
        if (this.stream)
            this.stream.setStart({ x: actualX + this.player.width / 2, y: this.player.y + this.player.height / 3 });
        if (targetX != actualX) {
            let bounceBackSpeed = this.playerCurrentSpeed / 2;
            this.playerCurrentSpeed = Math.round(bounceBackSpeed - (bounceBackSpeed * 2));
        }
        if (!this.caughtGhost && this.stream) {
            for (let i = 0; i < this.ghosts.length; i++) {
                let ghost = this.ghosts[i];
                if (ghost.isHit({ x: this.stream.x, y: this.stream.y })) {
                    this.caughtGhost = ghost;
                    this.caughtGhost.setTarget({ x: this.stream.x, y: this.stream.y });
                    break;
                }
            }
        }
        for (let i = 0; i < this.ghosts.length; i++) {
            this.ghosts[i].draw();
        }
        if (this.caughtGhost && this.stream) {
            this.stream.setSticky({ x: this.caughtGhost.x, y: this.caughtGhost.y }, this.caughtGhost.radius);
        }
        this.player.draw();
        if (this.stream)
            this.stream.draw();
        // if (progress < (1000 * this.GAME_LENGTH_SECONDS)) window.requestAnimationFrame((t:number) => {this.tick(t)});
        // else this.end();
        window.requestAnimationFrame((t) => { this.tick(t); });
    }
}
class Ghost {
    constructor(svg, x = 0, y = 0) {
        this.lightningLines = [];
        this.x = 0;
        this.y = 0;
        this.count = 0;
        this.lerp = 20;
        this.boltCount = 4;
        this.boltRadius = 40;
        this.bodyPoints = [
            { type: 'M', x: 50, y: 0 },
            { type: 'Q', x: 100, y: 0 },
            { x: 100, y: 50 },
            { type: 'L', x: 100, y: 100 },
            { x: 84, y: 90 },
            { x: 68, y: 100 },
            { x: 52, y: 90 },
            { x: 36, y: 100 },
            { x: 20, y: 90 },
            { x: 0, y: 100 },
            { x: 0, y: 50 },
            { type: 'Q', x: 0, y: 0 },
            { x: 50, y: 0 }
        ];
        this.eyePoints = [
            { type: 'M', x: 10, y: 0 },
            { type: 'Q', x: 20, y: 0 },
            { x: 20, y: 10 },
            { x: 20, y: 20 },
            { x: 10, y: 20 },
            { x: 0, y: 20 },
            { x: 0, y: 10 },
            { x: 0, y: 0 },
            { x: 10, y: 0 }
        ];
        this.eyePointsShocked = [
            { type: 'M', x: 15, y: 0 },
            { type: 'Q', x: 30, y: 0 },
            { x: 30, y: 15 },
            { x: 30, y: 30 },
            { x: 15, y: 30 },
            { x: 0, y: 30 },
            { x: 0, y: 15 },
            { x: 0, y: 0 },
            { x: 15, y: 0 }
        ];
        this.hitPoints = [
            { type: 'M', x: 0, y: 0 },
            { type: 'L', x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
        ];
        let random = Math.round(Math.random() * 10);
        this.width = 40 + random;
        this.height = 55 + random;
        this.svg = svg;
        this.x = x;
        this.y = y;
        this.group = this.svg.group();
        this.count = Math.random() * 100;
        this.body = this.group.path();
        this.body.attr({ fill: 'white', fillOpacity: 0.9 });
        this.rightEye = this.group.path();
        this.rightEye.attr({ fill: 'black' });
        this.leftEye = this.group.path();
        this.leftEye.attr({ fill: 'black' });
        this.blurLines = this.group.group();
        this.sharpLines = this.group.group();
        this.blurFilter = this.svg.filter(Snap.filter.blur(7, 7));
        this.blurLines.attr({ filter: this.blurFilter });
        for (let i = 0; i < this.boltCount; i++) {
            let line = i % 2 == 0 ? this.sharpLines.path() : this.blurLines.path();
            line.attr({
                fill: 'none',
                strokeLinecap: 'round',
                strokeOpacity: (i % 2 == 0) ? 0.8 : 1
            });
            this.lightningLines.push(line);
        }
        this.hitPath = this.group.path();
        this.hitPath.attr({ fill: 'red', fillOpacity: 0 });
        this.draw();
    }
    isHit(point) {
        return Snap.path.isPointInside(this.hitPath.attr('d'), point.x, point.y);
    }
    setTarget(position, streamStart) {
        this.target = position;
        this.streamStart = streamStart;
        this.setXYFromTarget();
    }
    clearTarget() {
        this.target = null;
    }
    setXYFromTarget() {
        this.x += (this.target.x - this.x) / this.lerp;
        this.y += (this.target.y - this.y) / this.lerp;
    }
    draw() {
        if (this.target)
            this.setXYFromTarget();
        if (!this.target) {
            this.count += 0.1;
            this.x += Math.sin(this.count * 0.5);
            this.y += Math.cos(this.count * 0.1);
        }
        let _x = this.target ? this.x + U.randomFromRange(-2, 2) : this.x;
        let _y = this.target ? this.y + U.randomFromRange(-2, 2) : this.y;
        this.hitPath.attr({ d: U.createPath(this.hitPoints, { x: _x - (this.width / 2), y: _y - (this.height / 2) }, { width: this.width, height: this.height }) });
        this.body.attr({ d: U.createPath(this.bodyPoints, { x: _x - (this.width / 2), y: _y - (this.height / 2) }, { width: this.width, height: this.height }) });
        this.rightEye.attr({ d: U.createPath(this.target ? this.eyePointsShocked : this.eyePoints, { x: _x + (this.width / 4) - 8, y: _y - (this.height / 4) }, { width: this.width, height: this.height }) });
        this.leftEye.attr({ d: U.createPath(this.target ? this.eyePointsShocked : this.eyePoints, { x: _x - (this.width / 4), y: _y - (this.height / 4) }, { width: this.width, height: this.height }) });
        for (let i = 0; i < this.lightningLines.length; i++) {
            let lineString = '';
            if (this.target) {
                let points = 18;
                let randomOffset = 4;
                for (let j = 0; j < points; j++) {
                    let rand = Math.random() * points;
                    let x = this.x + U.randomFromRange(-randomOffset, randomOffset) + this.boltRadius * Math.cos(2 * Math.PI * j / points);
                    let y = this.y + U.randomFromRange(-randomOffset, randomOffset) + this.boltRadius * Math.sin(2 * Math.PI * j / points);
                    lineString += (j == 0 ? 'M ' : ' L ') + x + ' ' + y;
                }
                lineString += 'Z';
            }
            this.lightningLines[i].attr({
                d: lineString,
                stroke: U.colors[Math.floor(Math.random() * U.colors.length)],
                strokeWidth: Math.random() * 3,
            });
        }
    }
}
class Player {
    constructor(svg) {
        this.speedChangeX = [0];
        this.x = 0;
        this.y = 0;
        this.width = 60;
        this.height = 60;
        this.setX = (newX) => {
            this.speedChangeX.push(this.x - newX);
            if (this.speedChangeX.length > 3)
                this.speedChangeX.shift();
            this.x = newX;
            let inertia = this.speedChangeX.reduce((a, b) => a + b, 0) / 2;
        };
        this.setY = (newY) => this.y = newY - this.height;
        this.svg = svg;
        this.group = this.svg.group();
    }
    draw() {
        this.group.attr({ transform: U.translate(this.x, this.y) });
    }
}
class Stream {
    constructor(svg) {
        this.x = 0;
        this.y = 0;
        this.bX = 0;
        this.bY = 0;
        this.targetLerp = 40;
        this.bezierLerp = 6;
        this.lightningLines = [];
        this.count = 0;
        this.boltCount = 20;
        this.boltPointSpace = 10;
        this.drawGuides = function () {
            this.targetBezierCircle.attr({
                cx: (Math.sin(this.count * 0.15) * 20) + (this.start.x + ((this.target.x - this.start.x) / this.bezierLerp)),
                cy: (Math.cos(this.count * 0.15) * 20) + (this.start.y + ((this.target.y - this.start.y) / this.bezierLerp))
            });
            this.targetCircle.attr({
                cx: this.target.x,
                cy: this.target.y
            });
        };
        this.svg = svg;
        this.group = this.svg.group();
        this.blurLines = this.group.group();
        this.sharpLines = this.group.group();
        this.blurFilter = this.svg.filter(Snap.filter.blur(7, 7));
        this.blurLines.attr({ filter: this.blurFilter });
        this.primaryLine = this.blurLines.path();
        this.primaryLine.attr({
            fill: 'none',
            stroke: '#0F5257',
            strokeOpacity: 0.2,
            strokeLinecap: 'round',
            strokeWidth: 15
        });
        this.targetBezierCircle = this.group.circle(-5, -5, 5);
        this.targetBezierCircle.attr({
            fill: 'red'
        });
        this.targetCircle = this.group.circle(-5, -5, 5);
        this.targetCircle.attr({
            fill: 'red'
        });
        for (let i = 0; i < this.boltCount; i++) {
            let line = i % 2 == 0 ? this.sharpLines.path() : this.blurLines.path();
            line.attr({
                fill: 'none',
                strokeLinecap: 'round',
                strokeOpacity: (i % 2 == 0) ? 0.8 : 1
            });
            this.lightningLines.push(line);
        }
    }
    setTarget(newTarget) {
        this.target = newTarget;
    }
    setStart(newStart) {
        this.start = newStart;
        if (!this.x || !this.y) {
            this.x = this.bX = this.start.x;
            this.y = this.bY = this.start.y;
        }
    }
    setSticky(newSticky) {
        this.sX = newSticky.x;
        this.sY = newSticky.y;
    }
    draw() {
        if (this.start && this.target) {
            ++this.count;
            this.targetLerp = this.targetLerp > 10 ? this.targetLerp - 3 : 10;
            this.bezierLerp = this.bezierLerp > 1.5 ? this.bezierLerp - 0.2 : 1.5;
            if (this.sX == null) {
                this.x += (this.target.x - this.x) / this.targetLerp;
                this.y += (this.target.y - this.y) / this.targetLerp;
            }
            else {
                this.x = this.sX;
                this.y = this.sY;
            }
            this.bX += (Math.sin(this.count * (this.sX ? 0.17 : 0.15)) * (this.sX ? 30 : 40)) + ((this.start.x + ((this.target.x - this.start.x) / this.bezierLerp)) - this.bX);
            this.bY += (Math.cos(this.count * (this.sX ? 0.17 : 0.15)) * (this.sX ? 30 : 40)) + ((this.start.y + ((this.target.y - this.start.y) / this.bezierLerp)) - this.bY);
            //this.drawGuides();
            let startString = 'M' + this.start.x + ' ' + this.start.y;
            let bezierString = 'Q' + this.bX + ' ' + this.bY;
            let targetString = ' ' + this.x + ' ' + this.y;
            this.primaryLine.attr({ d: startString + bezierString + targetString });
            let spaces = this.boltPointSpace;
            let pointAt = 0;
            let length = this.primaryLine.getTotalLength();
            let points = [];
            while (pointAt < length) {
                pointAt += spaces;
                points.push(this.primaryLine.getPointAtLength(pointAt));
            }
            for (let i = 0; i < this.lightningLines.length; i++) {
                let lineString = 'M' + this.start.x + ' ' + this.start.y;
                for (let j = 0; j < points.length; j++) {
                    let rand = ((this.boltPointSpace + 5) / this.lightningLines.length) * i;
                    let x = points[j].x + Math.random() * Math.sin(this.count * j) * (rand - (rand / points.length) * j);
                    let y = points[j].y + Math.random() * Math.cos(this.count * j) * (rand - (rand / points.length) * j);
                    lineString += ' ' + x + ' ' + y;
                }
                this.lightningLines[i].attr({
                    d: lineString,
                    stroke: U.colors[Math.floor(Math.random() * U.colors.length)],
                    strokeWidth: Math.random() * (this.sX ? 3 : 1),
                });
            }
        }
    }
    kill() {
        let spaces = 50;
        let pointAt = 0;
        let length = this.primaryLine.getTotalLength();
        let points = [];
        while (pointAt < length) {
            pointAt += spaces;
            points.push(this.primaryLine.getPointAtLength(pointAt));
        }
        this.primaryLine.animate({ strokeOpacity: 0, strokeWidth: 1 }, 1000);
        setTimeout(() => this.group.remove(), 1000);
        if (points.length) {
            for (let i = 0; i < this.lightningLines.length; i++) {
                let lineString = 'M' + this.start.x + ' ' + this.start.y;
                for (let j = 0; j < points.length; j++) {
                    let rand = (100 / this.lightningLines.length) * i;
                    let x = points[j].x + Math.random() * Math.sin(this.count * j) * (rand - (rand / points.length) * j);
                    let y = points[j].y + Math.random() * Math.cos(this.count * j) * (rand - (rand / points.length) * j);
                    lineString += ' ' + x + ' ' + y;
                }
                this.lightningLines[i].animate({ d: lineString, strokeOpacity: 0, strokeWidth: 1 }, 500);
            }
        }
    }
}
let game = new Game();
game.start();