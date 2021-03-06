/**
 * imagex
 * author: joeyguo
 * HomePage: https://github.com/gkajs/imagex
 * MIT Licensed.
 *
 * image split
 */

var fs = require('fs'),
    path = require('path'),
    mkdirp = require('mkdirp'),
    PNG = require('pngjs').PNG;

module.exports = split;

function split(isSplit, tmpDir, src2id, callback) {
    if (!isSplit) {
        callback(src2id);
        return;
    }

    tmpDir = path.join(tmpDir, 'split');

    var j = 0,
        k = 0,
        len = 0,
        src2idsplit = {},
        src2splitInfo = {};

    mkdirp(tmpDir, function (err) {
        for(var src in src2id) {
            ((src, id) => {
                var filename = path.basename(src),
                    trimFilepath = path.join(tmpDir, filename);

                pngSplit(src, function(rectArray, bitblt, info){

                    len += rectArray.length;
        
                    for(var i = 0; i < rectArray.length; i++){

                        var dest = path.join(tmpDir, k +'.png');

                        var rect = rectArray[i];

                        src2idsplit[dest] = k;
                        src2splitInfo[src] = src2splitInfo[src]? src2splitInfo[src]: [];
                        src2splitInfo[src].push({
                            "subfile": dest,
                            "width": rect.width,
                            "height": rect.height,
                            "offX": rect.lt.x,
                            "offY": rect.lt.y,
                            "sourceW": info.width,
                            "sourceH": info.height,
                        });

                        ++k;

                        bitblt(rect, dest, function(){
                            ++j;
                            if (j === len) {
                                console.log(' ✔ split done');
                                callback && callback(src2idsplit, src2splitInfo);
                            }
                        });

                    }
                })
            })(src, src2id[src]);
        }
    });
}

function pngSplit(src, callback) {

    fs.createReadStream(src)
    .pipe(new PNG({
        filterType: 4
    }))
    .on('parsed', function() {
        var _this   = this,
            _width  = this.width,
            _height = this.height,
            _data   = new Buffer(4 * _width * _height);

        this.data.copy(_data);

        var rectArray = getRectArray(_data, _height,_width);

        function bitblt(rect, dest, cb) {
            var newPng=new PNG({
                filterType: 4,
                width: rect.width,
                height: rect.height
            });
            _this.bitblt(newPng, rect.lt.x, rect.lt.y, rect.width, rect.height, 0, 0);
            var writeStream = fs.createWriteStream(dest).on('finish', function(){
                cb && cb();
            });
            newPng.pack().pipe(writeStream);
        }

        callback(rectArray, bitblt, {width: _width, height: _height});
    })
}

function getRectArray(data,height,width){

    var rectArray = [],
        vector = getVector(data, height, width);

    while(vector.length > 3){
        var rect = getRect(vector, data, width);

        if((rect.rt.x - rect.lt.x > 3) && (rect.lb.y - rect.lt.y > 3)){
            rectArray.push(rect);
        }

        for (var y = rect.rt.y; y < rect.rb.y; y++) {
            for (var x = rect.lb.x; x < rect.rb.x; x++) {
                var idx = (width * y + x) << 2;
                data[idx]   = 0;
                data[idx+1] = 0;
                data[idx+2] = 0;
                data[idx+3] = 0;
            }
        }

        vector = getVector(data, height, width);
    }
    return rectArray;
}

function getStartPoint(data,height,width){
    var point = new Point(-1,-1);
    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            var idx = (width * y + x) << 2;
            if(data[idx+3] !== 0){
                point.x = x;
                point.y = y;
                return point;
            }
        }
    }
    return point;
}

function getVector(data,height,width) {

    var vector     = [],
        startPoint = getStartPoint(data,height,width);

    if (startPoint !== null && startPoint.x >= 0) {

        var pX    = startPoint.x,
            pY    = startPoint.y,
            stepX = 0,
            stepY = 0,
            prevX = 0,
            prevY = 0,
            loop  = true,
            ix    = 0;

        while (loop) {

            var vectorValue = getVectorValue(data, pX, pY, width);

            switch (vectorValue) {
                case 1 :
                case 5 :
                case 13 :
                    stepX = 0;
                    stepY = -1;
                    break;
                case 8 :
                case 10 :
                case 11 :
                    stepX = 0;
                    stepY = 1;
                    break;
                case 4 :
                case 12 :
                case 14 :
                    stepX = -1;
                    stepY = 0;
                    break;
                case 2 :
                case 3 :
                case 7 :
                    stepX = 1;
                    stepY = 0;
                    break;
                case 6 :
                    if (prevX == 0 && prevY == -1) {
                        stepX = -1;
                        stepY = 0;
                    }
                    else {
                        stepX = 1;
                        stepY = 0;
                    }
                    break;
                case 9 :
                    if (prevX == 1 && prevY == 0) {
                        stepX = 0;
                        stepY = -1;
                    }
                    else {
                        stepX = 0;
                        stepY = 1;
                    }
                    break;
            }

            pX += stepX;
            pY += stepY;

            vector.push(new Point(pX, pY));

            prevX = stepX;
            prevY = stepY;
            ix++;

            if (pX == startPoint.x && pY == startPoint.y) {
                loop = false;
            }
            if(ix > 200000){
                break;
            }
        }
    }
    return vector;
}

function getVectorValue(data,pX,pY,width){
    var value = 0;

    if(!isTransparent(data, pX-1, pY-1, width)) {
        value += 1;
    }
    if(!isTransparent(data, pX, pY-1, width)) {
        value += 2;
    }
    if(!isTransparent(data, pX-1, pY, width)) {
        value += 4;
    }
    if(!isTransparent(data, pX, pY, width)) {
        value += 8;
    }
    return value;
}

function getRect(vector, data, width){
    var max_y = Number.MIN_VALUE,
        min_y = Number.MAX_VALUE,
        max_x = Number.MIN_VALUE,
        min_x = Number.MAX_VALUE;

    for(var i = 0;i < vector.length; i++){
        var p = vector[i];
        if (max_y < p.y) {
            max_y = p.y;
        }
        if (min_y > p.y) {
            min_y = p.y;
        }
        if (max_x < p.x) {
            max_x = p.x;
        }
        if (min_x > p.x) {
            min_x = p.x;
        }
    }

    return {
        lt: {x:min_x, y: min_y},
        lb: {x:min_x, y: max_y},
        rt: {x:max_x, y: min_y},
        rb: {x:max_x, y: max_y},
        width:  (max_x - min_x),
        height: (max_y - min_y),
    }
}

function Point(x,y){
    this.x = x;
    this.y = y;
}

function isTransparent(data,x,y,width) {
    if(x < 0 || y < 0){
        return true;
    }

    var idx = (width * y + x) << 2;

    if(data[idx+3] == 0)
        return true;
    else
        return false;
}