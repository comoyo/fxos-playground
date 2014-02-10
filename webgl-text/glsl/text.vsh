attribute vec4 a_position;
attribute vec2 a_textureCoordinates;

uniform vec2 u_canvasSize;
uniform vec2 u_location;

varying vec2 v_textureCoordinates;

vec4 toWorldCoordinates(vec4 canvasCoordinates) {
	return vec4(2.0 * canvasCoordinates.x / u_canvasSize.x - 1.0, -2.0 * canvasCoordinates.y / u_canvasSize.y + 1.0, canvasCoordinates.z, 1);
}

void main() {
	mat4 projection = mat4(1.0);
	projection[3] = vec4(u_location, 0, 1);
    gl_Position = toWorldCoordinates(projection * a_position);
    v_textureCoordinates = a_textureCoordinates;
}
