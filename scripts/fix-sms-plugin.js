import fs from 'fs';
import path from 'path';

const gradlePath = path.join(process.cwd(), 'node_modules', 'capacitor-sms-sender', 'android', 'build.gradle');

if (fs.existsSync(gradlePath)) {
  let content = fs.readFileSync(gradlePath, 'utf8');
  if (!content.includes('namespace "com.iqbalfn.capacitor.smssender"')) {
    content = content.replace('android {', 'android {\n    namespace "com.iqbalfn.capacitor.smssender"');
    fs.writeFileSync(gradlePath, content);
    console.log('Successfully fixed capacitor-sms-sender build.gradle (Added namespace)');
  } else {
    console.log('capacitor-sms-sender build.gradle already has namespace');
  }
} else {
  console.log('capacitor-sms-sender build.gradle not found, skipping fix');
}
