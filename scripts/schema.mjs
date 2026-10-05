import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'apps/web/package.json'));
const ts=require('typescript');
const source=ts.createSourceFile('model.ts',fs.readFileSync(path.join(root,'api/model.ts'),'utf8'),ts.ScriptTarget.Latest,true);
function schema(n){
 if(n.kind===ts.SyntaxKind.StringKeyword)return {type:'string'};
 if(n.kind===ts.SyntaxKind.NumberKeyword)return {type:'integer'};
 if(n.kind===ts.SyntaxKind.BooleanKeyword)return {type:'boolean'};
 if(ts.isArrayTypeNode(n))return {type:'array',items:schema(n.elementType)};
 if(ts.isTypeReferenceNode(n)){const name=n.typeName.getText(source);if(name==='Record')return {type:'object',additionalProperties:schema(n.typeArguments[1])};return {$ref:'#/components/schemas/'+name}}
 if(ts.isTypeLiteralNode(n)){const properties={},required=[];for(const m of n.members){const key=m.name.getText(source).replace(/^['"]|['"]$/g,'');properties[key]=schema(m.type);if(!m.questionToken)required.push(key)}return {type:'object',properties,required}}
 if(ts.isUnionTypeNode(n)){const rest=n.types.filter(t=>t.getText(source)!=='null');if(rest.length===1&&rest.length<n.types.length)return {...schema(rest[0]),nullable:true};return {oneOf:rest.map(schema)}}
 throw Error('Unsupported schema node: '+n.getText(source));
}
const spec=JSON.parse(fs.readFileSync(path.join(root,'api/openapi.json'),'utf8'));
const names=[];
for(const n of source.statements){if(ts.isTypeAliasDeclaration(n)){spec.components.schemas[n.name.text]=schema(n.type);names.push(n.name.text)}}
for(const [route,name] of [['/v1/world','World'],['/v1/state','Snapshot']]){spec.paths[route].get.responses['200']={description:'Authorized response',content:{'application/json':{schema:{$ref:'#/components/schemas/'+name}}}};}
spec.paths['/v1/profile'].get.responses['200']={description:'Public identity',content:{'application/json':{schema:{type:'object',required:['id','name','handle'],properties:Object.fromEntries(['id','name','handle'].map(k=>[k,{type:'string'}]))}}}};
fs.writeFileSync(path.join(root,'api/openapi.json'),JSON.stringify(spec,null,2)+'\n');
fs.writeFileSync(path.join(root,'apps/web/app/types.ts'),"// Generated from api/model.ts via the OpenAPI contract.\nimport type {components} from './api.generated';\n"+names.map(name=>`export type ${name}=components['schemas']['${name}'];`).join('\n')+'\n');
