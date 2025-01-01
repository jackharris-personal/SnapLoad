/*
 * Name : SnapLoad
 * Version: 3.4
 * Release Date: 23rd August 2024.
 * Description: SnapLoad allows you to build JavaScript library's and import them into your project at runtime, streamlining development and removing package management and build pipelines.
 * Author: Jack Harris
 * Author URI: jackgharris.com
 * License: MIT
 * License URI: https://opensource.org/license/mit
 */

class SnapLoad {


    static instance = new SnapLoad();

    static LOAD_TYPE_ASYNC = 0;
    static LOAD_TYPE_SYNCHRONOUS = 1;

    _repositories = new Map();
    _httpRequests = new Map();
    _packages = new Map();
    _resources = new Map();


    constructor() {
        this._repositories.set("opensource","https://assets.peppermintcloud.com.au/simpleui/repositories");
    }

    buildSourceUri(uri){

        let path = uri.split(".");

        let sourceUri = "";

        if(this._repositories.has(path[0])){
            sourceUri += this._repositories.get(path[0]);
        }

        //convert the rest to a directory path
        path.shift();

        path.forEach(section => {
            sourceUri += "/"+section;
        })


        return sourceUri;
    }


    static addRepository(name,uri){
        SnapLoad.instance._repositories.set(name,uri);
    }

    static addStylesheet(uri){

        let head = document.getElementsByTagName("head")[0];
        let isIncluded = false;

        head.childNodes.forEach((item)=>{
            if(item instanceof HTMLLinkElement){
                if(item.id === uri){
                    isIncluded = true;
                }
            }
        })

        if(!isIncluded){
            let style = document.createElement("link");
            style.href = SnapLoad.instance.buildSourceUri(uri)+".css";
            style.rel = "stylesheet";
            style.id = uri;
            head.appendChild(style);

        }
    }

    static setStyleProperty(key,value){
        document.body.style.setProperty(key,value);
    }

    static require(uri, callback,loadType = SnapLoad.LOAD_TYPE_ASYNC){
    

        let instance = SnapLoad.instance;
        let requireId = SnapLoad.generateUuid();

        if(uri instanceof Array){

            instance._httpRequests.set(requireId,{
                packages: [],
                callback: callback,
                objects: [],
                loadType: loadType
            });

            uri.forEach((request)=>{

                if(request.startsWith("fileReader.")){
                    instance._addJavascriptObject(request,requireId);
                    instance._httpRequests.get(requireId).objects.push(request);
                }else {

                    instance._addPackage(request, requireId,loadType);
                    instance._httpRequests.get(requireId).packages.push(request);
                }

            });

        }else{
            let wrapper = [
                uri
            ]

            SnapLoad.require(wrapper,callback)
        }

    }

    _addJavascriptObject(objectId, requestId){

        let request = objectId.substring(11);


        if(request.startsWith("image('") && request.endsWith("')")){

            let object= new Image();
            let source = request.substring(7)
            source =  source.substring(0,source.length-2)

            object.src = source;

            this._resources.set(objectId,{

                id: objectId,
                uri: source,
                element: object,
                status:{
                    id: 0,
                    description: "Pending."
                },
                callbacks: [requestId]
            });

            object.addEventListener("load", function () {
                SnapLoad.instance._completeObjectLoad(objectId)
            })

            object.onerror = function (error) {
                SnapLoad.instance._triggerPackageLoadError(objectId,error);
            }

        }else if(request.startsWith("text('") && request.endsWith("')")){

            let object = "";

            let source = request.substring(7)
            source =  source.substring(0,source.length-2)

            this._resources.set(objectId,{

                id: objectId,
                uri: source,
                element: object,
                status:{
                    id: 0,
                    description: "Pending."
                },
                callbacks: [requestId]
            });

            fetch(source).then(res => res.text()).then((text)=>{
                SnapLoad.instance._resources.get(objectId).element = text;
                SnapLoad.instance._completeObjectLoad(objectId);
            }).catch(error =>{
                SnapLoad.instance._triggerPackageLoadError(objectId,error);
            })

        }else if(request.startsWith("fontFace('") && request.endsWith("')")){

            let items = request.split(",");

            let name = items[0].substring(10);
            name = name.substring(0,name.length-1)

            let source = items[1].substring(2)
            source =  source.substring(0,source.length-2);
            source = "url("+source+")"

            let object = new FontFace(name,source);

            this._resources.set(objectId,{

                id: objectId,
                uri: source,
                element: object,
                name : name,
                status:{
                    id: 0,
                    description: "Pending."
                },
                callbacks: [requestId]
            });

            object.load().then(
                () => {
                    SnapLoad.instance._completeObjectLoad(objectId);
                },
                (error) => {
                    SnapLoad.instance._triggerPackageLoadError(objectId,error);
                },
            );


        }else if(request.startsWith("audio('") && request.endsWith("')")){

            let object = new Audio();

            let source = request.substring(7)
            source =  source.substring(0,source.length-2)

            let sourceParts = source.split("/");
            let name  = sourceParts[sourceParts.length-1];


            object.src = source;
            object.preload = "auto";

            this._resources.set(objectId,{

                id: name,
                uri: source,
                element: object,
                status:{
                    id: 0,
                    description: "Pending."
                },
                callbacks: [requestId]
            });

            this._completeObjectLoad(objectId)

        }else{
            console.error("[SnapLoad] "+objectId+" invalid syntax error, please check the syntax is as follows object('parameter').")
        }

    }

    _processRequireQueue(){

        this._httpRequests.forEach((callback,key)=>{

            let outcome = true;

            callback.packages.forEach((packageId)=>{
                let pkg = this._packages.get(packageId);
                if(pkg.status.id !== 1){
                    outcome = false;
                }
            });

            callback.objects.forEach((packageId)=>{
                let pkg = this._resources.get(packageId);

                if(pkg.status.id !== 1){
                    outcome = false;
                }
            });

            if(outcome){

                let objects = new Map();

                this._httpRequests.get(key).objects.forEach((object)=>{

                    let resourceItem = this._resources.get(object);

                    if(resourceItem.name  !== undefined){
                        objects.set(resourceItem.name,resourceItem.element)

                    }else{
                        objects.set(resourceItem.id,resourceItem.element)
                    }
                })

                callback.callback(objects);
                this._httpRequests.delete(key);

                this._packages.forEach((pkg) => {
                    pkg.callbacks = this._removeItemFromArray(key, pkg.callbacks);
                })

                this._resources.forEach((pkg) => {
                    pkg.callbacks = this._removeItemFromArray(key, pkg.callbacks);
                })

            }
        })

    }

    _addPackage(packageId,requestId,loadType){

        if(!this._packages.has(packageId)){

            let packageUri = this.buildSourceUri(packageId);
            packageUri += ".js";
        
        console.log(packageUri);

            let script = document.createElement("script");

            if(loadType === SnapLoad.LOAD_TYPE_SYNCHRONOUS){
                script.async = false;
            }

            this._packages.set(packageId,{

                id: packageId,
                uri: packageUri,
                element: script,
                status:{
                    id: 0,
                    description: "Pending."
                },
                callbacks: [requestId]

            });


            script.src = packageUri;
            script.id = packageId;

            script.addEventListener("load", function () {

                SnapLoad.instance._completePackageLoad(packageId);

            })

            script.onerror = function (error) {
                SnapLoad.instance._triggerPackageLoadError(packageId,error);
            }

            document.body.appendChild(script);

        }else{
            this._packages.get(packageId).callbacks.push(requestId);
        }
    }

    _completePackageLoad(packageId){

        let pkg = this._packages.get(packageId);
        pkg.status.id = 1;
        pkg.status.description = "Successfully loaded.";

        SnapLoad.instance._processRequireQueue();
    }

    _completeObjectLoad(objectId){
        let pkg = this._resources.get(objectId)
        pkg.status.id = 1;
        pkg.status.description = "Successfully loaded.";

        SnapLoad.instance._processRequireQueue();
    }


    _removeItemFromArray(item,array){
        const index = array.indexOf(item);
        if (index > -1) { // only splice array when item is found
            array.splice(index, 1); // 2nd parameter means remove one item only
        }

        return array;
    }

    _triggerPackageLoadError(packageId,error){

        console.error("[SimpleUI] "+packageId+" failed to load with error ",error)
    }



    static generateUuid() {

        let S4 = function() {
            return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
        };
        //return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());

        const array = new Uint32Array(4);
        self.crypto.getRandomValues(array);
        return array.toString().replaceAll(",","-");

    }

}
