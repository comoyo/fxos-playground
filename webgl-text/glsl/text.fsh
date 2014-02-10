uniform sampler2D u_texture;

varying highp vec2 v_textureCoordinates;

void main(void) {
    gl_FragColor = texture2D(u_texture, vec2(v_textureCoordinates.s, v_textureCoordinates.t));
}