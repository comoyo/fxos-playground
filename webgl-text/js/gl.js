function getShader(gl, path, type) {
    var shader;

    // FIXME: these sync requests are just laziness
    var request = new XMLHttpRequest();
    request.open('GET', path, false);
    request.send(null);

    if (request.status !== 200) {
        console.error('Unable to load shader ' + path);
    }

    var shaderSource = request.responseText;

    if (!shaderSource) {
        return null;
    }

    if (type === 'vertex') {
        shader = gl.createShader(gl.VERTEX_SHADER);
    } else if (type === 'fragment') {
        shader = gl.createShader(gl.FRAGMENT_SHADER);
    } else {
        // Unknown shader type
        return null;
    }

    gl.shaderSource(shader, shaderSource);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        return null;
    }

    return shader;
}