'use strict';
{
    const g=document.currentScript.src.match(/(.*\/)?/)[0],
        h=(WebAssembly.compileStreaming||(async a=>await WebAssembly.compile(await (await a).arrayBuffer())))
        (fetch(g+"rnnoise-processor.wasm"));

    let k,c,e;
    window.RNNoiseNode=(window.AudioWorkletNode||(window.AudioWorkletNode=window.webkitAudioWorkletNode)) &&
        class extends AudioWorkletNode{
            static async register(a)
            {
                k=await h;
                await a.audioWorklet.addModule(g+"rnnoise-processor.js");
            }
            constructor(a)
            {
                super(a,"rnnoise",{channelCountMode:"explicit", channelCount:1, channelInterpretation:"speakers",
                  numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],processorOptions:{module:k}
                });
                this.port.onmessage=({data:b})=>{
                    b=Object.assign(new Event("status"),b);
                    this.dispatchEvent(b);
                    if(this.onstatus)
                        this.onstatus(b)
                }
            }
            update(a){
                this.port.postMessage(a)
            }
    }
    ||(window.ScriptProcessorNode||(window.ScriptProcessorNode=window.webkitScriptProcessorNode)) &&
        Object.assign(function(a){
            const b=a.createScriptProcessor(512,1,1), d=c.newState();
            let f=!0;
            b.onaudioprocess= ({inputBuffer:b,outputBuffer:a})=>{
                f && (e.set(b.getChannelData(0),c.getInput(d)/4),b=a.getChannelData(0),
                (a=c.pipe(d,b.length)/4)&&b.set(e.subarray(a,a+b.length)))
            };
            b.update=a=>{
                if(f)
                    if(a){
                        if(a = Object.assign(new Event("status"),{vadProb:c.getVadProb(d)}), b.dispatchEvent(a),b.onstatus)
                            b.onstatus(a)
                    }else
                        f=!1,c.deleteState(d)};
            return b
        },
            {
                register:async()=>{
                    c||(e=new Float32Array((c=(await WebAssembly.instantiate(await h)).exports).memory.buffer))
                }
            })
};
