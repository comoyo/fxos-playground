function Text(gl) {
    this.gl = gl;
    this.scratchCanvas = document.createElement('canvas');

    // FIXME: should not be fixed width and height
    this.scratchCanvas.setAttribute('width', 256);
    this.scratchCanvas.setAttribute('height', 256);
    // FIXME: not attaching the canvas to the DOM works in Firefox, but not Chrome

    this.scratchCanvasContext = this.scratchCanvas.getContext('2d');

    var vertexShader = getShader(gl, 'glsl/text.vsh', 'vertex');
    var fragmentShader = getShader(gl, 'glsl/text.fsh', 'fragment');

    var shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error('Unable to link shader program!');
    }

    this.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, 'a_position');
    gl.enableVertexAttribArray(this.vertexPositionAttribute);

    this.textureCoordAttribute = gl.getAttribLocation(shaderProgram, 'a_textureCoordinates');
    gl.enableVertexAttribArray(this.textureCoordAttribute);

    this.vertexBuffer = gl.createBuffer();
    this.textureBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, this.textureBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0.0, 0.0,
        0.0,  1.0,
        1.0,  0.0,
        1.0,  1.0
    ]), gl.STATIC_DRAW);

    this.shaderProgram = shaderProgram;

    this.setPosition(0, 0);

    // FIXME: should not be fixed width and height
    this.setSize(256, 256);
}

Text.prototype.render = function() {
    var gl = this.gl;

    if (!(this.shaderProgram && this.texture)) {
        return;
    }

    gl.useProgram(this.shaderProgram);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.vertexAttribPointer(this.vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.textureBuffer);
    gl.vertexAttribPointer(this.textureCoordAttribute, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(gl.getUniformLocation(this.shaderProgram, 'u_texture'), 0);

    // FIXME: should not be fixed width and height
    gl.uniform2f(gl.getUniformLocation(this.shaderProgram, 'u_canvasSize'), 256, 256);
    gl.uniform2f(gl.getUniformLocation(this.shaderProgram, 'u_location'), this.x, this.y);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
};


Text.prototype.setText = function(text) {
    var gl = this.gl;
    var scratchCanvas = this.scratchCanvas;
    var scratchCanvasContext = this.scratchCanvasContext;

    // FIXME: should not be fixed width and height
    scratchCanvasContext.clearRect(0, 0, 256, 256);
    scratchCanvasContext.fillText(text, 0, 20, scratchCanvas.clientWidth);

    if (!this.texture) {
        this.texture = gl.createTexture();
    }

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scratchCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
};

Text.prototype.setPosition = function(x, y) {
    this.x = x;
    this.y = y;
};

Text.prototype.setSize = function(width, height) {
    var gl = this.gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0.0, 0.0, 0.0,
        0.0, height, 0.0,
        width, 0.0, 0.0,
        width, height, 0.0
    ]), gl.STATIC_DRAW);
}