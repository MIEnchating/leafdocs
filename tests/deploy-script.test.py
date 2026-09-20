# Run with python3 tests/deploy-script.test.py; Docker Compose parses fixtures, runtime calls are mocked.
import os, subprocess, tempfile, pathlib, json, pty, select, time
root=pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='leafdocs-installer-test-') as temp:
 t=pathlib.Path(temp); bin=t/'bin'; bin.mkdir(); deploy=t/'existing'; deploy.mkdir()
 wrapper=bin/'docker'
 wrapper.write_text('''#!/usr/bin/env python3
import os,sys,subprocess,json
args=sys.argv[1:]
with open(os.environ['INSTALL_TEST_LOG'],'a') as f:f.write(json.dumps(args)+'\\n')
if args[:2]==['compose','version'] or args==['info']:sys.exit(0)
if args[:2]==['network','inspect']:sys.exit(0 if args[2]=='newapi_default' else 1)
if 'config' in args:
 result=subprocess.run(['/usr/bin/docker',*args[:-1],'--format','json'],capture_output=True,text=True)
 if result.returncode:sys.exit(result.returncode)
 with open(os.environ['INSTALL_TEST_CONFIG'],'w') as f:f.write(result.stdout)
 sys.exit(0)
if 'pull' in args or 'up' in args or 'ps' in args or 'logs' in args:sys.exit(0)
sys.exit(99)
''');wrapper.chmod(0o755)
 env={**os.environ,'PATH':str(bin)+':'+os.environ['PATH'],'INSTALL_TEST_LOG':str(t/'calls'),'INSTALL_TEST_CONFIG':str(t/'config')}
 original="DOMAIN=docs.example.com\nPOSTGRES_PASSWORD=originaldatabasepassword\nADMIN_EMAIL=admin@example.com\nADMIN_PASSWORD='originalAdminPassword123'\n"
 (deploy/'.env').write_text(original); (deploy/'compose.yaml').write_text('old config\n'); (deploy/'compose.override.yaml').write_text('invalid legacy override\n')
 run=lambda args:subprocess.run(['bash',str(root/'deploy.sh'),*args],env=env,capture_output=True,text=True)
 r=run(['--dir',str(deploy),'--network','newapi_default']);assert r.returncode==0,r.stderr
 assert (deploy/'.env').read_text()==original
 assert (deploy/'compose.previous.yaml').read_text()=='old config\n'
 cfg=json.loads((t/'config').read_text());assert set(cfg['services'])=={'db','app'}
 assert set(cfg['services']['db']['networks'])=={'default'}
 assert cfg['networks']['proxy']['name']=='newapi_default' and cfg['networks']['proxy']['external']
 assert cfg['volumes']['database']['name']=='leafdocs_database'
 assert cfg['volumes']['uploads']['name']=='leafdocs_uploads'
 assert run(['update','--dir',str(deploy)]).returncode==0
 assert subprocess.run(['bash',str(deploy/'deploy.sh'),'status'],env=env,capture_output=True).returncode==0
 assert run(['--dir',str(deploy),'--network','-']).returncode==0
 assert 'proxy' not in json.loads((t/'config').read_text())['networks']
 assert run(['--dir',str(deploy),'--network','missing-network']).returncode!=0
 print('PASS: migrate existing deployment, preserve secrets/volumes, ignore legacy overrides, persist network, reject missing network')
 fresh=t/'fresh'
 master,slave=pty.openpty()
 p=subprocess.Popen(['bash',str(root/'deploy.sh'),'--dir',str(fresh),'--network','newapi_default'],stdin=slave,stdout=slave,stderr=slave,env=env);os.close(slave)
 password="Long$pass#with'quote\\and spaces"
 prompts=[('站点域名','docs.example.com'),('管理员邮箱','admin@example.com'),('管理员密码（',password),('再次输入',password)]
 buffer='';deadline=time.time()+30
 while p.poll() is None and time.time()<deadline:
  if select.select([master],[],[],0.1)[0]:
   try: buffer+=os.read(master,65536).decode(errors='replace')
   except OSError:break
  if prompts and prompts[0][0] in buffer:
   _,answer=prompts.pop(0);os.write(master,(answer+'\n').encode());buffer=''
 p.wait(timeout=5);os.close(master)
 assert p.returncode==0 and not prompts,buffer
 cfg=json.loads((t/'config').read_text());assert cfg['services']['app']['environment']['ADMIN_PASSWORD'].replace('$$','$')==password
 assert (fresh/'.env').stat().st_mode&0o777==0o600
 assert len(cfg['services']['db']['environment']['POSTGRES_PASSWORD'])==64
 print('PASS: interactive fresh installation, hidden password, special characters round trip, random database password and private .env')
