<h2 class="my-4 text-lg">Rules of engagement</h2>

<p>
	<span class="font-bold">If you find a vulnerability</span>, contact us before going public as it
	may impact systems already in production.
</p>

<p>
	In other words, please respect a responsible disclosure of 30 days. We will patch and then publish
	vulnerability. Depending on the finding a CVE might be requested, and will have your name - except
	if you dont want to.
</p>

<p>
	You can report anything you find at <a href="mailto:contact@dfir-iris.org"
		>contact@dfir-iris.org</a
	>.
</p>

<p class="mt-4">
	<span class="font-bold">The scope of the security tests</span> is limited to the Web Application
	IRIS hosted on <a href="https://v200.beta.dfir-iris.org">v200.beta.dfir-iris.org</a>.
</p>

<p class="mb-4 text-red-500">
	Subdomains, SSH, scanning of the IP, BF, and other flavors are <span class="font-bold"
		>out of scope</span
	>.
</p>

<p>We are mostly interested in the following:</p>

<ul class="list-disc pl-6">
	<li>
		<span class="font-bold">authentication bypass</span>: achieve any action requiring an
		authentication without being authenticated.
		<span class="text-red-500">Brute-force is not what we are looking for</span>
	</li>

	<li>
		<span class="font-bold">privilage excalations within the application</span>: from a standard
		user (<span class="font-red-400 font-mono">user_std_XX</span>) to administrative rights (<span
			class="font-red-400 font-mono">adm_XX</span
		>) on IRIS
	</li>

	<li>
		<span class="font-bold">privilage escalations on the host server</span>: from a standard user (<span
			class="font-red-400 font-mono">user_std_XX</span
		>) to code execution on the server
	</li>

	<li>
		<span class="font-bold">data leakage</span>: from a standard user (<span
			class="font-red-400 font-mono">user_std_XX</span
		>) read data of non-accessible cases (titled
		<span class="font-mono text-red-500">Restricted Case XXX</span>)
	</li>
</ul>

<h2 class="my-4 text-lg">Important Remarks</h2>

<ul class="list-disc pl-6">
	<li>
		If you can, use a local intance of IRIS instead of this one. It only takes a few minuts to get
		it on docker.
	</li>
	<li>
		The administrators account can publish stored XSS on the platform via Custom Attributes. This is
		an operational requirement and not recognized as a vulnerability.
	</li>
	<li>
		<span class="font-bold">Try not to be destructive</span>. If you manage to run code on the host
		server, do not try to go further.
	</li>
</ul>

<h2 class="my-4 text-lg">Restrictions</h2>

<p>To keep this instance alive, there are some restrictions put in place.</p>

<ul class="list-disc pl-6">
	<li>
		The <span class="font-mono text-red-500">administrator</span> account cannot be updated nor deleted.
	</li>
	<li>The accounts available on this page cannot be updated nore deleted.</li>
	<li>File upload in datastore is limited to 200KB per file.</li>
</ul>

<h2 class="my-4 text-lg">Resources</h2>

<p>
	You can read more about IRIS on the <a href="https://docs.dfir-iris.org/latest/"
		>official documentation website</a
	>.
</p>
<p>
	IRIS is an open source app, so you can directly access the code on <a href="htts://github.com"
		>GitHub</a
	>.
</p>
