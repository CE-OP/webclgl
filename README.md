[![Logo](demos/webclgl.jpg)](https://github.com/stormcolor/webclgl)

[![Gitter](https://badges.gitter.im/stormcolor/webclgl.svg)](https://gitter.im/stormcolor/webclgl?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

<h2>Javascript Library for general purpose computing on GPU, aka GPGPU.</h2>
WebCLGL use WebGL specification for interpreter the code.<br />


<h3>Now only one dependency is required</h3>
```html

    <script src="/js/WebCLGL.class.js"></script>
```

<h3>For a simple A+B</h3>
```js

    // TYPICAL A + B WITH CPU
    var arrayResult = [];
    for(var n = 0; n < _length; n++) {
        var sum = arrayA[n]+arrayB[n];
        arrayResult[n] = sum;
    }

    // PERFORM A + B WITH GPU
    var arrayResult = gpufor({"float* A": arrayA, "float* B": arrayB}, "n",
                              "float sum = A[n]+B[n];"+
                              "return sum;");
```

- <a href="https://rawgit.com/stormcolor/webclgl/master/demos/gpufor/index.html"> gpufor A+B</a><br />

<h3>Using numbers</h3>
```js

    var num = 0.01;

    // CPU
    var arrayResult = [];
    for(var n = 0; n < _length; n++) {
        var sum = arrayA[n]+arrayB[n]+num;
        arrayResult[n] = sum;
    }

    // GPU
    var arrayResult = gpufor({"float* A": arrayA, "float* B": arrayB, "float num": num}, "n",
                              "float sum = A[n]+B[n]+num;"+
                              "return sum;");
```

- <a href="https://rawgit.com/stormcolor/webclgl/master/demos/gpufor_numbers/index.html"> gpufor A+B+number</a><br />

<h3>Using arrays type vector</h3>
```js

    var arrayResult = gpufor({"float* A": arrayA, "float4* B": arrayB}, "n",
                              "float _A = A[n];"+
                              "vec4 _B = B[n];"+
                              "float sum = _A+_B.z;"+
                              "return sum;");
```

- <a href="https://rawgit.com/stormcolor/webclgl/master/demos/gpufor_vectors/index.html"> gpufor vector read</a><br />

<h3>Vector as output</h3>
```js

    var arrayResult = gpufor({"float4* A": arrayA, "float4* B": arrayB}, "n", "FLOAT4",
                              "vec4 _A = A[n];"+
                              "vec4 _B = B[n];"+
                              "vec4 sum = _A+_B;"+
                              "return sum;");
```

- <a href="https://rawgit.com/stormcolor/webclgl/master/demos/gpufor_vectors_output/index.html"> gpufor vector output</a><br />

<h3>Output datatypes</h3>
For to change the return precision from 0.0->1.0 by default to -1000.0->1000.0 set the gpufor precision variable:
```js

    gpufor_precision = 1000.0;
    var arrayResult = gpufor...
```


<h3>Graphical output</h3>
To represent data that evolve over time you can enable the graphical output as follows:
```html

    <canvas id="graph" width="512" height="512"></canvas>
``` 

```js
   
       var gpufG = gpufor( document.getElementById("graph"), // canvas or existings WebGL context
                           {"float4* posXYZW": arrayNodePosXYZW,
                           "float4* dir": arrayNodeDir,
                           "float*attr nodeId": arrayNodeId,
                           "mat4 PMatrix": transpose(getProyection()),
                           "mat4 cameraWMatrix": transpose(new Float32Array([  1.0, 0.0, 0.0, 0.0,
                                                                               0.0, 1.0, 0.0, 0.0,
                                                                               0.0, 0.0, 1.0, -100.0,
                                                                               0.0, 0.0, 0.0, 1.0])),
                           "mat4 nodeWMatrix": transpose(new Float32Array([1.0, 0.0, 0.0, 0.0,
                                                                           0.0, 1.0, 0.0, 0.0,
                                                                           0.0, 0.0, 1.0, 0.0,
                                                                           0.0, 0.0, 0.0, 1.0]))},
                       
                           // KERNEL PROGRAM (update "dir" & "posXYZW" in return instruction)
                           {"type": "KERNEL",
                           "config": ["n", ["dir","posXYZW"],
                                       // head
                                       '',
                                       // source
                                       'vec3 currentPos = posXYZW[n].xyz;\n'+
                                       'vec3 newDir = dir[n].xyz*0.995;\n'+
                                       'return [vec4(newDir,0.0), vec4(currentPos,1.0)+vec4(newDir,0.0)];\n']},
                       
                           // GRAPHIC PROGRAM
                           {"type": "GRAPHIC",
                           "config": [ // vertex head
                                       '',
                               
                                       // vertex source
                                       'vec2 xx = get_global_id(nodeId[], uBufferWidth, 1.0);'+
                               
                                       'vec4 nodePosition = posXYZW[xx];\n'+ // now use the updated posXYZW
                                       'mat4 nodepos = nodeWMatrix;'+
                                       'nodepos[3][0] = nodePosition.x;'+
                                       'nodepos[3][1] = nodePosition.y;'+
                                       'nodepos[3][2] = nodePosition.z;'+
                               
                                       'gl_Position = PMatrix * cameraWMatrix * nodepos * vec4(1.0, 1.0, 1.0, 1.0);\n'+
                                       'gl_PointSize = 2.0;\n',
                               
                                       // fragment head
                                       '',
                               
                                       // fragment source
                                       'gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);\n']}
                         );
```
```js

    var tick = function() {
                    window.requestAnimFrame(tick);
    
                    gpufG.processKernels();
    
                    var gl = gpufG.getCtx();
                    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                    gl.viewport(0, 0, 512, 512);
                    gl.clearColor(0.0, 0.0, 0.0, 1.0);
                    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);  
    
                    //gpufG.setArg("pole1X", 30);
    
                    gpufG.processGraphic("posXYZW", gl.POINTS);
                };
```

- <a href="https://rawgit.com/stormcolor/webclgl/master/demos/gpufor_graphics/index.html"> gpufor graphic output</a><br />
- <a href="https://rawgit.com/stormcolor/webclgl/master/demos/gpufor_graphics_geometry/index.html"> gpufor graphic output (using custom geometry)</a><br />

When Max_draw_buffers is equal to 1 you can save only in one variable. For this you can use more Kernels:
```js
   
       var gpufG = gpufor( document.getElementById("graph"),
                           {"float4* posXYZW": arrayNodePosXYZW,
                           "float4* dir": arrayNodeDir,
                           "float*attr nodeId": arrayNodeId,
                           "mat4 PMatrix": transpose(getProyection()),
                           "mat4 cameraWMatrix": transpose(new Float32Array([  1.0, 0.0, 0.0, 0.0,
                                                                               0.0, 1.0, 0.0, 0.0,
                                                                               0.0, 0.0, 1.0, -100.0,
                                                                               0.0, 0.0, 0.0, 1.0])),
                           "mat4 nodeWMatrix": transpose(new Float32Array([1.0, 0.0, 0.0, 0.0,
                                                                           0.0, 1.0, 0.0, 0.0,
                                                                           0.0, 0.0, 1.0, 0.0,
                                                                           0.0, 0.0, 0.0, 1.0]))},
                       
                           // KERNEL PROGRAM 1 (for to update "dir" argument)
                           {"type": "KERNEL",
                           "config": ["n", "dir",
                                       // head
                                       '',
                                       // source
                                       'vec3 newDir = dir[n].xyz*0.995;\n'+
                                       'return vec4(newDir,0.0);\n']},
                       
                           // KERNEL PROGRAM 2 (for to update "posXYZW" argument from updated "dir" argument on KERNEL1)
                           {"type": "KERNEL",
                           "config": ["posXYZW += dir"]},
                       
                           // GRAPHIC PROGRAM
                           {"type": "GRAPHIC",
                           "config": [ // vertex head
                                       '',
                               
                                       // vertex source
                                       'vec2 xx = get_global_id(nodeId[], uBufferWidth, 1.0);'+
                               
                                       'vec4 nodePosition = posXYZW[xx];\n'+ // now use the updated posXYZW
                                       'mat4 nodepos = nodeWMatrix;'+
                                       'nodepos[3][0] = nodePosition.x;'+
                                       'nodepos[3][1] = nodePosition.y;'+
                                       'nodepos[3][2] = nodePosition.z;'+
                               
                                       'gl_Position = PMatrix * cameraWMatrix * nodepos * vec4(1.0, 1.0, 1.0, 1.0);\n'+
                                       'gl_PointSize = 2.0;\n',
                               
                                       // fragment head
                                       '',
                               
                                       // fragment source
                                       'gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);\n']}
                         );
```

- <a href="https://rawgit.com/stormcolor/webclgl/master/demos/gpufor_graphics_no_mrt/index.html"> gpufor graphic without MRT</a><br />

<h3>Argument types</h3>

Variable type	|	Value
----------------------- |-------------------------------
float*			            | Array<Float or Int>, Float32Array, Uint8Array, WebGLTexture, HTMLImageElement
float4*		            	| Array<Float or Int>, Float32Array, Uint8Array, WebGLTexture, HTMLImageElement
float		            	| 30
float4		            	| [30.0, 10.0, 5.0, 100.0]
mat4		            	| new Float32Array([1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, -100.0, 0.0, 0.0, 0.0, 1.0]);
float*attr			        | Array<Float or Int>, Float32Array, Uint8Array, WebGLTexture, HTMLImageElement
float4*attr		            | Array<Float or Int>, Float32Array, Uint8Array, WebGLTexture, HTMLImageElement
Use float4 instead vec4 only in the definition of the variables (not in code). 

`*attr` for indicate arguments of type "attributes" (Graphic program only). <br />
`*attr` only allow get the same/current ID value:

```js

    // Vertex part of Graphic program
    main(float4*attr nodeVertexCoord) {
        vec4 nvc = nodeVertexCoord[];
    }
```

`*` without `attr` allow to get another ID (internally is sampler2D) for to get a specific node data id or a texture location: <br />
Arguments type sampler2D (no attribute) are allowed to be written by a kernel program.

```js

    // Vertex part of Graphic program
    main(float4* nodePosition) {
        vec2 x = get_global_id(ID, bufferWidth, geometryLength);
        vec4 np = nodePosition[x];
    }
```




<h3><a href="https://rawgit.com/stormcolor/webclgl/master/APIdoc/APIdoc/gpufor.html">API Doc WebCLGL</a></h3>
<h3><a href="http://www.khronos.org/files/webgl/webgl-reference-card-1_0.pdf">OpenGL ES Shading Language 1.0 Reference Card (Pag 3-4)</a></h3>




<h3>Old demos (without use gpufor function)</h3>
- <a href="https://rawgit.com/stormcolor/webclgl/master/demos/basic_sum_AB/index.html"> Basic example A+B</a><br />
- <a href="https://rawgit.com/stormcolor/webclgl/master/demos/basic_sum_AB_and_number/index.html"> Basic example A+B+num</a><br />
- <a href="https://rawgit.com/stormcolor/webclgl/master/demos/benchmarks/index.html"> Benchmarks</a><br />
- <a href="https://rawgit.com/stormcolor/webclgl/master/demos/using_vectors/index.html"> Using vectors</a><br />
- <a href="https://rawgit.com/stormcolor/webclgl/master/demos/using_vectors_as_output/index.html"> Using vectors as output</a><br />
- <a href="https://rawgit.com/stormcolor/webclgl/master/demos/WebCLGLWork_3D_graphics/index.html"> Graphic output using WebCLGLWork</a> <br />
- <a href="https://github.com/stormcolor/SCEJS"> SCEJS</a> use WebCLGL as low level layer. You can See this for advanced examples


<br />
<br />
<h3>ChangeLog</h3>
<h4>v3.1</h4>
(Graphic mode only)
- Allow write in more than final variable if client hardware allow (WEBGL_draw_buffers extension) 
- webCLGL.enqueueNDRangeKernel allow webCLGLBuffer or Array of webCLGLBuffer for destination
- webCLGLWork.enqueueNDRangeKernel not require any argument (nor webCLGL.copy required)
- gpufor not require update call

<h4>v3.0</h4>
- Changed *kernel in VertexFragmentPrograms(VFP) to *attr for indicate arguments of type "attributes". <br />
- Deleted optional geometryLength argument in enqueueNDRangeKernel & enqueueVertexFragmentProgram. It is indicated through glsl code with next available methods: <br />
get_global_id(ID, bufferWidth, geometryLength) (in Kernels & vertex of VFP) (The last get_global_id(ID) is removed) <br />
get_global_id(vec2(row, col), bufferWidth) (in Kernels & fragment of VFP) <br />
get_global_id() (only in Kernels fot to get) <br />
 <br />
Changed method setUpdateFromKernel to setAllowKernelWriting in WebCLGLWork <br />

