#!/bin/bash
rm -rf ./dist

yarn clean

yarn build:min.js

echo "upload files"
bucketName=particle-network-static
ossutilmac64 cp -r -f ./dist oss://${bucketName}/sdks/web/aa-sdk/

echo "${G}Done"
