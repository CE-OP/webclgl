/*
The MIT License (MIT)

Copyright (c) <2013> <Roberto Gonzalez. http://stormcolour.appspot.com/>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
 */

var webCLGLDirectory = document.querySelector('script[src$="WebCLGL.class.js"]').getAttribute('src');
var page = webCLGLDirectory.split('/').pop();
webCLGLDirectory = webCLGLDirectory.replace('/'+page,"");

var includesF = ['/WebCLGLUtils.class.js',
    '/WebCLGLBuffer.class.js',
    '/WebCLGLBufferItem.class.js',
    '/WebCLGLKernel.class.js',
    '/WebCLGLVertexFragmentProgram.class.js',
    '/WebCLGLWork.class.js',
    '/WebCLGLFor.class.js'];
for(var n = 0, f = includesF.length; n < f; n++) document.write('<script type="text/javascript" src="'+webCLGLDirectory+includesF[n]+'"></script>');

/**
* Class for parallelization of calculations using the WebGL context similarly to webcl. This library use floating point texture capabilities (OES_texture_float)
* @class
* @constructor
* @param {WebGLRenderingContext} [webglcontext=undefined] your WebGLRenderingContext
*/
var WebCLGL = function(webglcontext) {
    "use strict";

	this.utils = new WebCLGLUtils();
    var _webCLGLWorks = [];

	// WEBGL CONTEXT
	var _gl;
	this.e = undefined;
	if(webglcontext == undefined) {
		this.e = document.createElement('canvas');
		this.e.width = 32;
		this.e.height = 32;
		_gl = this.utils.getWebGLContextFromCanvas(this.e, {antialias: false});
	} else _gl = webglcontext;

    // required extensions: OES_texture_float && OES_texture_float_linear
    var _arrExt = {"OES_texture_float":null, "OES_texture_float_linear":null, "OES_element_index_uint":null, "WEBGL_draw_buffers":null};
    for(var key in _arrExt) {
        _arrExt[key] = _gl.getExtension(key);
        if(_arrExt[key] == null)
            console.error("extension "+key+" not available");
    }
    var _maxDrawBuffers = null;
    if(_arrExt.hasOwnProperty("WEBGL_draw_buffers") && _arrExt["WEBGL_draw_buffers"] != null) {
        _maxDrawBuffers = _gl.getParameter(_arrExt["WEBGL_draw_buffers"].MAX_DRAW_BUFFERS_WEBGL);
        console.log("Max draw buffers: "+_maxDrawBuffers);
    } else
        console.log("Max draw buffers: 1");

	var highPrecisionSupport = _gl.getShaderPrecisionFormat(_gl.FRAGMENT_SHADER, _gl.HIGH_FLOAT);
	this.precision = (highPrecisionSupport.precision != 0) ? 'precision highp float;\n\nprecision highp int;\n\n' : 'precision lowp float;\n\nprecision lowp int;\n\n';
    var _currentTextureUnit;
    var _bufferWidth = 0;

	// QUAD
	var mesh = this.utils.loadQuad(undefined,1.0,1.0);
	this.vertexBuffer_QUAD = _gl.createBuffer();
	_gl.bindBuffer(_gl.ARRAY_BUFFER, this.vertexBuffer_QUAD);
	_gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array(mesh.vertexArray), _gl.STATIC_DRAW);
	this.textureBuffer_QUAD = _gl.createBuffer();
	_gl.bindBuffer(_gl.ARRAY_BUFFER, this.textureBuffer_QUAD);
	_gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array(mesh.textureArray), _gl.STATIC_DRAW);
	this.indexBuffer_QUAD = _gl.createBuffer();
	_gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer_QUAD);
	_gl.bufferData(_gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.indexArray), _gl.STATIC_DRAW);



	// SHADER READPIXELS
	var sourceVertex = 	this.precision+
			'attribute vec3 aVertexPosition;\n'+
			'attribute vec2 aTextureCoord;\n'+

			'varying vec2 vTextureCoord;\n'+

			'void main(void) {\n'+
				'gl_Position = vec4(aVertexPosition, 1.0);\n'+
				'vTextureCoord = aTextureCoord;\n'+
			'}\n';
	var sourceFragment = this.precision+
			'uniform sampler2D sampler_buffer;\n'+

			'uniform int u_vectorValue;\n'+
			'uniform int u_offset;\n'+

			'varying vec2 vTextureCoord;\n'+

			this.utils.packGLSLFunctionString()+

			'void main(void) {\n'+
				'vec4 tex = texture2D(sampler_buffer, vTextureCoord);'+
				'if(u_offset > 0) {'+
					'float offset = float(u_offset);'+
					'if(u_vectorValue == 0) gl_FragColor = pack((tex.r+offset)/(offset*2.0));\n'+
					'if(u_vectorValue == 1) gl_FragColor = pack((tex.g+offset)/(offset*2.0));\n'+
					'if(u_vectorValue == 2) gl_FragColor = pack((tex.b+offset)/(offset*2.0));\n'+
					'if(u_vectorValue == 3) gl_FragColor = pack((tex.a+offset)/(offset*2.0));\n'+
				'} else {'+
					'if(u_vectorValue == 0) gl_FragColor = pack(tex.r);\n'+
					'if(u_vectorValue == 1) gl_FragColor = pack(tex.g);\n'+
					'if(u_vectorValue == 2) gl_FragColor = pack(tex.b);\n'+
					'if(u_vectorValue == 3) gl_FragColor = pack(tex.a);\n'+
				'}'+
			'}\n';

	this.shader_readpixels = _gl.createProgram();
	this.utils.createShader(_gl, "CLGLREADPIXELS", sourceVertex, sourceFragment, this.shader_readpixels);

	this.u_offset = _gl.getUniformLocation(this.shader_readpixels, "u_offset");
	this.u_vectorValue = _gl.getUniformLocation(this.shader_readpixels, "u_vectorValue");

	this.sampler_buffer = _gl.getUniformLocation(this.shader_readpixels, "sampler_buffer");

	this.attr_VertexPos = _gl.getAttribLocation(this.shader_readpixels, "aVertexPosition");
	this.attr_TextureCoord = _gl.getAttribLocation(this.shader_readpixels, "aTextureCoord");



	// SHADER COPYTEXTURE
	var sourceVertex = 	this.precision+
		'attribute vec3 aVertexPosition;\n'+
		'attribute vec2 aTextureCoord;\n'+

		'varying vec2 vTextureCoord;\n'+

		'void main(void) {\n'+
			'gl_Position = vec4(aVertexPosition, 1.0);\n'+
			'vTextureCoord = aTextureCoord;\n'+
		'}';
	var sourceFragment = this.precision+

		'uniform sampler2D sampler_toSave;\n'+

		'varying vec2 vTextureCoord;\n'+

		'void main(void) {\n'+
			'vec4 texture = texture2D(sampler_toSave, vTextureCoord);\n'+
			'gl_FragColor = texture;'+
		'}';
	this.shader_copyTexture = _gl.createProgram();
	this.utils.createShader(_gl, "CLGLCOPYTEXTURE", sourceVertex, sourceFragment, this.shader_copyTexture);

	this.attr_copyTexture_pos = _gl.getAttribLocation(this.shader_copyTexture, "aVertexPosition");
	this.attr_copyTexture_tex = _gl.getAttribLocation(this.shader_copyTexture, "aTextureCoord");

	this.sampler_copyTexture_toSave = _gl.getUniformLocation(this.shader_copyTexture, "sampler_toSave");

    this.rBuffer;

    /**
     * getContext
     * @returns {WebGLRenderingContext}
     */
    this.getContext = function() {
        return _gl;
    };

    /**
     * getRenderBuffer
     * @returns {WebGLRenderBuffer}
     */
    this.getRenderBuffer = function() {
        return this.rBuffer;
    };

    /**
     * getMaxDrawBuffers
     * @returns {Int}
     */
    this.getMaxDrawBuffers = function() {
        return _maxDrawBuffers;
    };

    /**
     * Copy one WebCLGLBuffer|WebGLTexture to another WebCLGLBuffer|WebGLTexture.
     * @param {WebCLGLBuffer|WebGLTexture} valueToRead The buffer to read.
     * @param {WebCLGLBuffer|WebGLTexture} valueToWrite The buffer to write.
     * @example
     * // This is useful if you need to write about a buffer and also want to read it by passing it as an argument in main().
     * // If this is the case, you have to create a temporary buffer for the writing and take the original buffer for the reading:
     * kernelA.setKernelArg (x, ORIGINALbuffer);
     * webCLGL.enqueueNDRangeKernel (kernelA, TMPbuffer);
     * kernelB.setKernelArg (x, ORIGINALbuffer);
     * webCLGL.enqueueNDRangeKernel (kernelB, anotherBuffer);
     * // Then overwrite the original with the temporary:
     * webCLGL.copyTexture (TMPbuffer, ORIGINALbuffer);
     */
    this.copy = function(valuesToRead, valuesToWrite) {
        if(valuesToRead instanceof WebCLGLBuffer) {
            for(var i=0; i < valuesToRead.items.length; i++)
                copyItem(valuesToRead.items[i], valuesToWrite.items[i]);
        } else if(valuesToRead instanceof WebGLTexture) // WebGLTexture
            copyItem(valuesToRead, valuesToWrite);
    };

    var copyItem = (function(valueToRead, valueToWrite) {
        if(valueToRead instanceof WebCLGLBufferItem) {
            _gl.viewport(0, 0, valueToWrite.W, valueToWrite.H);
            if(valueToWrite.fBuffer == undefined) {
                this.rBuffer = valueToWrite.createWebGLFrameBuffer(this.rBuffer);
            }
            _gl.bindFramebuffer(_gl.FRAMEBUFFER, valueToWrite.fBuffer);
            _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _gl.COLOR_ATTACHMENT0, _gl.TEXTURE_2D, valueToWrite.textureData, 0);
        } else if(valueToRead instanceof WebGLTexture)
            _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _gl.COLOR_ATTACHMENT0, _gl.TEXTURE_2D, valueToWrite, 0);


        _gl.useProgram(this.shader_copyTexture);

        _gl.activeTexture(_gl.TEXTURE0);
        var toRead = (valueToRead instanceof WebGLTexture) ? valueToRead : valueToRead.textureData;
        _gl.bindTexture(_gl.TEXTURE_2D, toRead);
        _gl.uniform1i(this.sampler_copyTexture_toSave, 0);


        _gl.enableVertexAttribArray(this.attr_copyTexture_pos);
        _gl.bindBuffer(_gl.ARRAY_BUFFER, this.vertexBuffer_QUAD);
        _gl.vertexAttribPointer(this.attr_copyTexture_pos, 3, _gl.FLOAT, false, 0, 0);

        _gl.enableVertexAttribArray(this.attr_copyTexture_tex);
        _gl.bindBuffer(_gl.ARRAY_BUFFER, this.textureBuffer_QUAD);
        _gl.vertexAttribPointer(this.attr_copyTexture_tex, 3, _gl.FLOAT, false, 0, 0);

        _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer_QUAD);
        _gl.drawElements(_gl.TRIANGLES, 6, _gl.UNSIGNED_SHORT, 0);
    }).bind(this);

    /**
     * Create a empty WebCLGLBuffer
     * @param {Int|Array<Float>} length Length of buffer or Array with width and height values if is for a WebGLTexture
     * @param {String} [type="FLOAT"] type FLOAT4 OR FLOAT
     * @param {Int} [offset=0] If 0 the range is from 0.0 to 1.0 else if >0 then the range is from -offset.0 to offset.0
     * @param {Bool} [linear=false] linear texParameteri type for the WebGLTexture
     * @param {String} [mode="SAMPLER"] Mode for this buffer. "SAMPLER", "ATTRIBUTE", "VERTEX_INDEX"
     * @param {Array} [splits=[length]] Splits length for this buffer.
     * @returns {WebCLGLBuffer}
     */
    this.createBuffer = function(length, type, offset, linear, mode, splits) {
        return new WebCLGLBuffer(_gl, length, type, offset, linear, mode, splits);
    };

    /**
     * Create a kernel
     * @returns {WebCLGLKernel}
     * @param {String} [source=undefined]
     * @param {String} [header=undefined] Additional functions
     */
    this.createKernel = function(source, header) {
        var webclglKernel = new WebCLGLKernel(_gl, source, header);
        return webclglKernel;
    };

    /**
     * Create a vertex and fragment programs for a WebGL graphical representation after some enqueueNDRangeKernel
     * @returns {WebCLGLVertexFragmentProgram}
     * @param {String} [vertexSource=undefined]
     * @param {String} [vertexHeader=undefined]
     * @param {String} [fragmentSource=undefined]
     * @param {String} [fragmentHeader=undefined]
     */
    this.createVertexFragmentProgram = function(vertexSource, vertexHeader, fragmentSource, fragmentHeader) {
        var webclglVertexFragmentProgram = new WebCLGLVertexFragmentProgram(_gl, vertexSource, vertexHeader, fragmentSource, fragmentHeader);
        return webclglVertexFragmentProgram;
    };

    /**
     * Create work
     * @returns {WebCLGLWork}
     */
    this.createWork = function(offset) {
        var webclglWork = new WebCLGLWork(this, offset);
        _webCLGLWorks.push(webclglWork);
        return webclglWork;
    };

    /**
     * getWorks
     * @returns {Array<WebCLGLWork>}
     */
    this.getWorks = function() {
        return _webCLGLWorks;
    };

    /**
     * Write on buffer
     * @type Void
     * @param {WebCLGLBuffer} buffer
     * @param {Array|Float32Array|Uint8Array|WebGLTexture|HTMLImageElement} array
     * @param {Bool} [flip=false]
     */
    this.enqueueWriteBuffer = function(buffer, arr, flip) {
        if(buffer.mode == "SAMPLER") {
            buffer.writeWebGLTextureBuffer(arr, flip);
            buffer.writeWebGLBuffer(arr, flip);
        }
        if(buffer.mode == "ATTRIBUTE" || buffer.mode == "VERTEX_INDEX") {
            buffer.writeWebGLBuffer(arr, flip);
        }
    };

    /**
     * fillBuffer with color
     * @param {WebCLGLBuffer} buffer
     * @param {Array<Float>} clearColor
     */
    this.fillBuffer = function(buffer, clearColor) {
        if(buffer.items[0].fBuffer == undefined)
            buffer.items[0].createWebGLFrameBuffer(this.getRenderBuffer());

        _gl.bindFramebuffer(_gl.FRAMEBUFFER, buffer.items[0].fBuffer);

        if(_maxDrawBuffers != null) {
            _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _arrExt["WEBGL_draw_buffers"].COLOR_ATTACHMENT0_WEBGL, _gl.TEXTURE_2D, buffer.items[0].textureData, 0);
            _arrExt["WEBGL_draw_buffers"].drawBuffersWEBGL([
                _arrExt["WEBGL_draw_buffers"].COLOR_ATTACHMENT0_WEBGL
            ]);
        } else
            _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _gl.COLOR_ATTACHMENT0, _gl.TEXTURE_2D, buffer.items[0].textureData, 0);


        if(clearColor != undefined)
            _gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
        _gl.clear(_gl.COLOR_BUFFER_BIT | _gl.DEPTH_BUFFER_BIT);
    };

    /**
     * bindAttributeValue
     * @pram {WebCLGLVertexFragmentProgram}
     * @param {Object} inValue
     * @param {Int} itemNum
     * @private
     */
    var bindAttributeValue = (function(webCLGLProgram, inValue, itemNum) {
        if(inValue.value != undefined && inValue.value != null) {
            var item = (inValue.value.items[itemNum] != undefined) ? inValue.value.items[itemNum] : inValue.value.items[0];
            if(inValue.type == 'float4_fromAttr') {
                _gl.enableVertexAttribArray(inValue.location[0]);
                _gl.bindBuffer(_gl.ARRAY_BUFFER, item.vertexData0);
                _gl.vertexAttribPointer(inValue.location[0], 4, _gl.FLOAT, false, 0, 0);
            } else if(inValue.type == 'float_fromAttr') {
                _gl.enableVertexAttribArray(inValue.location[0]);
                _gl.bindBuffer(_gl.ARRAY_BUFFER, item.vertexData0);
                _gl.vertexAttribPointer(inValue.location[0], 1, _gl.FLOAT, false, 0, 0);
            }
        } else
            _gl.disableVertexAttribArray(inValue.location[0]);
    }).bind(this);

    /**
     * bindSamplerValue
     * @pram {WebCLGLKernel|WebCLGLVertexFragmentProgram}
     * @param {Object} inValue
	 * @param {Int} itemNum
     * @private
     */
    var bindSamplerValue = (function(webCLGLProgram, inValue, itemNum) {
        if(_currentTextureUnit < 16)
            _gl.activeTexture(_gl["TEXTURE"+_currentTextureUnit]);
        else
            _gl.activeTexture(_gl["TEXTURE16"]);

        if(inValue.value != undefined && inValue.value != null) {
            var item = (inValue.value.items[itemNum] != undefined) ? inValue.value.items[itemNum] : inValue.value.items[0];
            _gl.bindTexture(_gl.TEXTURE_2D, item.textureData);
            _gl.uniform1i(inValue.location[0], _currentTextureUnit);

            if(_bufferWidth == 0) {
                _bufferWidth = item.W;
                _gl.uniform1f(webCLGLProgram.uBufferWidth, _bufferWidth);
            }
        } else
            _gl.bindTexture(_gl.TEXTURE_2D, null);

        _currentTextureUnit++;
    }).bind(this);

    /**
     * bindUniformValue
     * @param {Object} inValue
     * @private
     */
    var bindUniformValue = (function(inValue) {
        if(inValue.value != undefined && inValue.value != null) {
            if(inValue.type == 'float')
                _gl.uniform1f(inValue.location[0], inValue.value);
            else if(inValue.type == 'float4')
                _gl.uniform4f(inValue.location[0], inValue.value[0], inValue.value[1], inValue.value[2], inValue.value[3]);
            else if(inValue.type == 'mat4')
                _gl.uniformMatrix4fv(inValue.location[0], false, inValue.value);
        }
    }).bind(this);

    /**
     * bindValue
     * @pram {WebCLGLKernel|WebCLGLVertexFragmentProgram}
     * @param {Object} inValue
	 * @param {Int} itemNum
     * @private
     */
    var bindValue = (function(webCLGLProgram, inValue, itemNum) {
        switch(inValue.expectedMode) {
            case "ATTRIBUTE":
                bindAttributeValue(webCLGLProgram, inValue, itemNum);
                break;
            case "SAMPLER":
                bindSamplerValue(webCLGLProgram, inValue, itemNum);
                break;
            case "UNIFORM":
                bindUniformValue(inValue);
                break;
        }
    }).bind(this);

    /**
     * Perform calculation and save the result on a WebCLGLBuffer
     * @param {WebCLGLKernel} webCLGLKernel
     * @param {WebCLGLBuffer|Array<WebCLGLBuffer>} [webCLGLBuffer=undefined]
     */
    this.enqueueNDRangeKernel = function(webCLGLKernel, webCLGLBuffers) {
        _bufferWidth = 0;

        _gl.useProgram(webCLGLKernel.kernel);

        if(webCLGLBuffers != undefined) {
            if(webCLGLBuffers instanceof WebCLGLBuffer) {
                for(var i=0; i < webCLGLBuffers.items.length; i++) {
                    var outputBuff_currItem = webCLGLBuffers.items[i];

                    if(outputBuff_currItem.length > 0) {
                        _gl.viewport(0, 0, outputBuff_currItem.W, outputBuff_currItem.H);
                        if(outputBuff_currItem.fBuffer == undefined) {
                            this.rBuffer = outputBuff_currItem.createWebGLFrameBuffer(this.rBuffer);
                        }
                        _gl.bindFramebuffer(_gl.FRAMEBUFFER, outputBuff_currItem.fBuffer);

                        if(_maxDrawBuffers != null) {
                            _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _arrExt["WEBGL_draw_buffers"].COLOR_ATTACHMENT0_WEBGL, _gl.TEXTURE_2D, outputBuff_currItem.textureData, 0);
                            _arrExt["WEBGL_draw_buffers"].drawBuffersWEBGL([
                                _arrExt["WEBGL_draw_buffers"].COLOR_ATTACHMENT0_WEBGL
                            ]);
                        } else {
                            _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _gl.COLOR_ATTACHMENT0, _gl.TEXTURE_2D, outputBuff_currItem.textureData, 0);
                        }

                        enqueueNDRangeKernelNow(webCLGLKernel, i);
                    }
                }
            } else { // Array of WebCLGLBuffers
                var firstOutputBuff = webCLGLBuffers[0];
                if(firstOutputBuff != undefined) {
                    for(var i=0; i < firstOutputBuff.items.length; i++) {
                        var firstOutputBuff_currItem = firstOutputBuff.items[i];

                        if(firstOutputBuff_currItem.length > 0) {
                            _gl.viewport(0, 0, firstOutputBuff_currItem.W, firstOutputBuff_currItem.H);
                            if(firstOutputBuff_currItem.fBuffer == undefined) {
                                this.rBuffer = firstOutputBuff_currItem.createWebGLFrameBuffer(this.rBuffer);
                            }
                            _gl.bindFramebuffer(_gl.FRAMEBUFFER, firstOutputBuff_currItem.fBuffer);

                            if(_maxDrawBuffers != null) {
                                if(webCLGLBuffers.length > _maxDrawBuffers)
                                    console.log("Exceded maxDrawBuffers of "+maxDrawBuffers);

                                var arrDBuff = [];
                                for(var n= 0, fn=webCLGLBuffers.length; n < fn; n++) {
                                    _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _arrExt["WEBGL_draw_buffers"]['COLOR_ATTACHMENT'+n+'_WEBGL'], _gl.TEXTURE_2D, webCLGLBuffers[n].items[i].textureData, 0);
                                    arrDBuff[n] = _arrExt["WEBGL_draw_buffers"]['COLOR_ATTACHMENT'+n+'_WEBGL']; //gl_FragData[n]
                                }
                                _arrExt["WEBGL_draw_buffers"].drawBuffersWEBGL(arrDBuff);
                            } else {
                                _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _gl.COLOR_ATTACHMENT0, _gl.TEXTURE_2D, webCLGLBuffers[n].items[i].textureData, 0);
                            }

                            enqueueNDRangeKernelNow(webCLGLKernel, i);
                        }
                    }
                }
            }
        } else {
            _gl.bindFramebuffer(_gl.FRAMEBUFFER, null);

            enqueueNDRangeKernelNow(webCLGLKernel, 0);
        }
    };

    /**
     * @private
     * @param {WebCLGLKernel} webCLGLKernel
     * @param {Int} item
     */
    var enqueueNDRangeKernelNow = (function(webCLGLKernel, i) {
        _currentTextureUnit = 0;
        for(var key in webCLGLKernel.in_values)
            bindValue(webCLGLKernel, webCLGLKernel.in_values[key], i);

        _gl.enableVertexAttribArray(webCLGLKernel.attr_VertexPos);
        _gl.bindBuffer(_gl.ARRAY_BUFFER, this.vertexBuffer_QUAD);
        _gl.vertexAttribPointer(webCLGLKernel.attr_VertexPos, 3, _gl.FLOAT, false, 0, 0);

        _gl.enableVertexAttribArray(webCLGLKernel.attr_TextureCoord);
        _gl.bindBuffer(_gl.ARRAY_BUFFER, this.textureBuffer_QUAD);
        _gl.vertexAttribPointer(webCLGLKernel.attr_TextureCoord, 3, _gl.FLOAT, false, 0, 0);

        _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer_QUAD);
        _gl.drawElements(_gl.TRIANGLES, 6, _gl.UNSIGNED_SHORT, 0);
    }).bind(this);

    /**
     * Perform WebGL graphical representation
     * @param {WebCLGLVertexFragmentProgram} webCLGLVertexFragmentProgram
     * @param {WebCLGLBuffer} buffer Buffer to draw type (type indices or vertex)
     * @param {Int} [drawMode=4] 0=POINTS, 3=LINE_STRIP, 2=LINE_LOOP, 1=LINES, 5=TRIANGLE_STRIP, 6=TRIANGLE_FAN and 4=TRIANGLES
     * @param {WebCLGLBuffer} [buffDest=undefined]
     */
    this.enqueueVertexFragmentProgram = function(webCLGLVertexFragmentProgram, buffer, drawMode, buffDest) {
        _bufferWidth = 0;

        var Dmode = (drawMode != undefined) ? drawMode : 4;

        if(buffDest != undefined) {
            _gl.bindFramebuffer(_gl.FRAMEBUFFER, buffDest.items[0].fBuffer);
            if(_maxDrawBuffers != null) {
                _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _arrExt["WEBGL_draw_buffers"].COLOR_ATTACHMENT0_WEBGL, _gl.TEXTURE_2D, buffDest.items[0].textureData, 0);
                _arrExt["WEBGL_draw_buffers"].drawBuffersWEBGL([
                    _arrExt["WEBGL_draw_buffers"].COLOR_ATTACHMENT0_WEBGL
                ]);
            } else {
                _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _gl.COLOR_ATTACHMENT0, _gl.TEXTURE_2D, buffDest.items[0].textureData, 0);
            }
        }

        _gl.useProgram(webCLGLVertexFragmentProgram.vertexFragmentProgram);

        if(buffer != undefined) {
            for(var i=0; i < buffer.items.length; i++) {
                var bufferItem = buffer.items[i];

                _gl.uniform1f(webCLGLVertexFragmentProgram.uOffset, bufferItem.offset);

                _currentTextureUnit = 0;
                for(var key in webCLGLVertexFragmentProgram.in_vertex_values)
                    bindValue(webCLGLVertexFragmentProgram, webCLGLVertexFragmentProgram.in_vertex_values[key], i);

                //_currentTextureUnit = 0;
                for(var key in webCLGLVertexFragmentProgram.in_fragment_values)
                    bindValue(webCLGLVertexFragmentProgram, webCLGLVertexFragmentProgram.in_fragment_values[key], i);

                if(buffer.mode == "VERTEX_INDEX") {
                    _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, buffer.items[i].vertexData0);
                    _gl.drawElements(Dmode, buffer.items[i].length, _gl.UNSIGNED_SHORT, 0);
                } else {
                    _gl.drawArrays(Dmode, 0, buffer.items[i].length);
                }
            }
        }
    };

    /**
     * Get the internally WebGLTexture (type FLOAT), if the WebGLRenderingContext was given.
     * @returns {WebGLTexture}
     */
    this.enqueueReadBuffer_WebGLTexture = function(buffer) {
        return buffer.items[0].textureData;
    };

    /**
     * Get RGBAUint8Array array from a WebCLGLBuffer <br>
     * Read buffer in a specifics WebGL 32bit channel and return the data in one array of packets RGBA_Uint8Array <br>
     * @param {WebCLGLBuffer} buffer
     * @param {Int} channel Channel to read
     * @returns {Uint8Array}
     **/
    var enqueueReadBuffer = (function(buffer, item) {
        _gl.uniform1i(this.u_vectorValue, item);

        _gl.uniform1i(this.u_offset, buffer.offset);

        _gl.activeTexture(_gl.TEXTURE0);
        _gl.bindTexture(_gl.TEXTURE_2D, buffer.textureData);
        _gl.uniform1i(this.sampler_buffer, 0);


        _gl.enableVertexAttribArray(this.attr_VertexPos);
        _gl.bindBuffer(_gl.ARRAY_BUFFER, this.vertexBuffer_QUAD);
        _gl.vertexAttribPointer(this.attr_VertexPos, 3, buffer._supportFormat, false, 0, 0);

        _gl.enableVertexAttribArray(this.attr_TextureCoord);
        _gl.bindBuffer(_gl.ARRAY_BUFFER, this.textureBuffer_QUAD);
        _gl.vertexAttribPointer(this.attr_TextureCoord, 3, buffer._supportFormat, false, 0, 0);

        _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer_QUAD);
        _gl.drawElements(_gl.TRIANGLES, 6, _gl.UNSIGNED_SHORT, 0);

        var arrLength = buffer.length*4;
        if(item == 0) {
            if(buffer.outArray4Uint8ArrayX == undefined) {
                buffer.outArray4Uint8ArrayX = new Uint8Array((buffer.W*buffer.H)*4);
            }
            _gl.readPixels(0, 0, buffer.W, buffer.H, _gl.RGBA, _gl.UNSIGNED_BYTE, buffer.outArray4Uint8ArrayX);
            return buffer.outArray4Uint8ArrayX.slice(0, arrLength);
        } else if(item == 1) {
            if(buffer.outArray4Uint8ArrayY == undefined) {
                buffer.outArray4Uint8ArrayY = new Uint8Array((buffer.W*buffer.H)*4);
            }
            _gl.readPixels(0, 0, buffer.W, buffer.H, _gl.RGBA, _gl.UNSIGNED_BYTE, buffer.outArray4Uint8ArrayY);
            return buffer.outArray4Uint8ArrayY.slice(0, arrLength);
        } else if(item == 2) {
            if(buffer.outArray4Uint8ArrayZ == undefined) {
                buffer.outArray4Uint8ArrayZ = new Uint8Array((buffer.W*buffer.H)*4);
            }
            _gl.readPixels(0, 0, buffer.W, buffer.H, _gl.RGBA, _gl.UNSIGNED_BYTE, buffer.outArray4Uint8ArrayZ);
            return buffer.outArray4Uint8ArrayZ.slice(0, arrLength);
        } else if(item == 3) {
            if(buffer.outArray4Uint8ArrayW == undefined) {
                buffer.outArray4Uint8ArrayW = new Uint8Array((buffer.W*buffer.H)*4);
            }
            _gl.readPixels(0, 0, buffer.W, buffer.H, _gl.RGBA, _gl.UNSIGNED_BYTE, buffer.outArray4Uint8ArrayW);
            return buffer.outArray4Uint8ArrayW.slice(0, arrLength);
        }
    }).bind(this);

    /** @private **/
    var prepareViewportForBufferRead = (function(buffer) {
        _gl.viewport(0, 0, buffer.W, buffer.H);
        _gl.bindFramebuffer(_gl.FRAMEBUFFER, null);
        if(this.e != undefined) {
            this.e.width = buffer.W;
            this.e.height = buffer.H;
        }
    }).bind(this);

    /**
     * Get 4 RGBAUint8Array arrays from a WebCLGLBuffer type FLOAT4 <br>
     * Internally performs four calls to enqueueReadBuffer and return the data in one array of four packets RGBA_Uint8Array
     * @param {WebCLGLBuffer} buffer
     **/
    this.enqueueReadBuffer_Packet4Uint8Array_Float4 = function(buffers) {
        if(buffers.items[0].type == "FLOAT4") {
            for(var i=0; i < buffers.items.length; i++) {
                var buffer = buffers.items[i];

                prepareViewportForBufferRead(buffer);
                _gl.useProgram(this.shader_readpixels);

                buffer.Packet4Uint8Array_Float4 = [	enqueueReadBuffer(buffer, 0),
                                                    enqueueReadBuffer(buffer, 1),
                                                    enqueueReadBuffer(buffer, 2),
                                                    enqueueReadBuffer(buffer, 3)];
            }
        }
    };

    /**
     * Get 4 Float32Array arrays from a WebCLGLBuffer type FLOAT4 <br>
     * Internally performs one calls to enqueueReadBuffer and return the data in one array of four Float32Array
     * @param {WebCLGLBuffer} buffer
     * @returns {Array<Array>}
     */
    this.enqueueReadBuffer_Float4 = function(buffers) {
        var Float4_Un = [[],[],[],[]];
        if(buffers.items[0].type == "FLOAT4") {
            for(var i=0; i < buffers.items.length; i++) {
                var buffer = buffers.items[i];

                prepareViewportForBufferRead(buffer);
                _gl.useProgram(this.shader_readpixels);

                buffer.Packet4Uint8Array_Float4 = [	enqueueReadBuffer(buffer, 0),
                                                    enqueueReadBuffer(buffer, 1),
                                                    enqueueReadBuffer(buffer, 2),
                                                    enqueueReadBuffer(buffer, 3)];
                buffer.Float4 = [];

                for(var n=0, fn= 4; n < fn; n++) {
                    var arr = buffer.Packet4Uint8Array_Float4[n];

                    var outArrayFloat32Array = new Float32Array((buffer.W*buffer.H));
                    for(var nb = 0, fnb = arr.length/4; nb < fnb; nb++) {
                        var idd = nb*4;
                        if(buffer.offset>0) outArrayFloat32Array[nb] = (this.utils.unpack([arr[idd+0]/255,
                                arr[idd+1]/255,
                                arr[idd+2]/255,
                                arr[idd+3]/255])*(buffer.offset*2))-buffer.offset;
                        else outArrayFloat32Array[nb] = (this.utils.unpack([	arr[idd+0]/255,
                            arr[idd+1]/255,
                            arr[idd+2]/255,
                            arr[idd+3]/255]));
                        Float4_Un[n].push(outArrayFloat32Array[nb]);
                    }

                    buffer.Float4.push(outArrayFloat32Array.slice(0, buffer.length));
                }
            }
        }

        return Float4_Un;
    };

    /**
     * Get 1 RGBAUint8Array array from a WebCLGLBuffer type FLOAT <br>
     * Internally performs one call to enqueueReadBuffer and return the data in one array of one packets RGBA_Uint8Array
     * @param {WebCLGLBuffer} buffer
     *
     * @example
     * // Unpack in your shader to float with:
     * float unpack (vec4 4Uint8Array) {
    *	const vec4 bitShifts = vec4(1.0,1.0 / 255.0, 1.0 / (255.0 * 255.0), 1.0 / (255.0 * 255.0 * 255.0));
    * 	return dot(4Uint8Array, bitShifts);
    * }
     * float offset = "OFFSET OF BUFFER";
     * vec4 4Uint8Array = atributeFloatInPacket4Uint8Array; // IF UNPACK IN VERTEX PROGRAM
     * vec4 4Uint8Array = texture2D(samplerFloatInPacket4Uint8Array, vTextureScreenCoord); // IF UNPACK IN FRAGMENT PROGRAM
     * float value = (offset > 0.0) ? (unpack(4Uint8Array)*(offset*2.0))-offset : unpack(4Uint8Array);
     *
     * // JAVASCRIPT IF UNPACK IN VERTEX PROGRAM
     * attr_FloatInPacket4Uint8Array = gl.getAttribLocation(shaderProgram, "atributeFloatInPacket4Uint8Array");
     * gl.bindBuffer(gl.ARRAY_BUFFER, webGLBufferObject);
     * gl.bufferSubData(gl.ARRAY_BUFFER, 0, webCLGL.enqueueReadBuffer_Packet4Uint8Array_Float(buffer_XX)[0]);
     * gl.vertexAttribPointer(attr_FloatInPacket4Uint8Array, 4, gl.UNSIGNED_BYTE, true, 0, 0); // true for normalize
     *
     * // JAVASCRIPT IF UNPACK IN FRAGMENT PROGRAM
     * sampler_FloatInPacket4Uint8Array = gl.getUniformLocation(shaderProgram, "samplerFloatInPacket4Uint8Array");
     * gl.activeTexture(gl.TEXTURE0);
     * gl.bindTexture(gl.TEXTURE_2D, webGLTextureObject);
     * gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, viewportWidth,viewportHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, webCLGL.enqueueReadBuffer_Packet4Uint8Array_Float(buffer_XX)[0]);
     * gl.uniform1i(sampler_FloatInPacket4Uint8Array, 0);
     */
    this.enqueueReadBuffer_Packet4Uint8Array_Float = function(buffers) {
        if(buffers.items[0].type == "FLOAT") {
            for(var i=0; i < buffers.items.length; i++) {
                var buffer = buffers.items[i];

                prepareViewportForBufferRead(buffer);
                _gl.useProgram(this.shader_readpixels);

                buffer.Packet4Uint8Array_Float = [enqueueReadBuffer(buffer, 0)];
            }
        }
    };

    /**
     * Get 1 Float32Array array from a WebCLGLBuffer type FLOAT <br>
     * Internally performs one calls to enqueueReadBuffer and return the data in one array of one Float32Array
     * @param {WebCLGLBuffer} buffer
     * @returns {Array<Array>}
     */
    this.enqueueReadBuffer_Float = function(buffers) {
        var Float_Un = [[]];
        if(buffers.items[0].type == "FLOAT") {
            for(var i=0; i < buffers.items.length; i++) {
                var buffer = buffers.items[i];

                prepareViewportForBufferRead(buffer);
                _gl.useProgram(this.shader_readpixels);

                buffer.Packet4Uint8Array_Float = [enqueueReadBuffer(buffer, 0)];
                buffer.Float = [];

                for(var n=0, fn= 1; n < fn; n++) {
                    var arr = buffer.Packet4Uint8Array_Float[n];

                    var outArrayFloat32Array = new Float32Array((buffer.W*buffer.H));
                    for(var nb = 0, fnb = arr.length/4; nb < fnb; nb++) {
                        var idd = nb*4;
                        if(buffer.offset>0) outArrayFloat32Array[nb] = (this.utils.unpack([arr[idd+0]/255,
                                arr[idd+1]/255,
                                arr[idd+2]/255,
                                arr[idd+3]/255])*(buffer.offset*2))-buffer.offset;
                        else outArrayFloat32Array[nb] = (this.utils.unpack([	arr[idd+0]/255,
                            arr[idd+1]/255,
                            arr[idd+2]/255,
                            arr[idd+3]/255]));
                        Float_Un[n].push(outArrayFloat32Array[nb]);
                    }

                    buffer.Float.push(outArrayFloat32Array.slice(0, buffer.length));
                }
            }
        }

        return Float_Un;
    };
};