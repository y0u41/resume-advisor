// blue-split-04 · 蓝色左右分栏（版式参考 resume-workshop，MIT License）
// 左侧深蓝侧栏承载"我是谁与联系方式/技能/链接"，右侧白底主栏承载"做了什么"。
export const blueSplit04 = {
  code: "blue-split-04",
  name: "蓝色左右分栏",
  category: "通用",
  sortOrder: 40,
  html: `<div class="page">
  <aside class="side">
    <div class="avatar-name">
      {{#if photo}}<img class="tpl-photo-side" src="{{photo}}" alt="" />{{/if}}
      <h1>{{basics.name}}</h1>
    </div>
    <div class="block">
      <h3>联系方式</h3>
      <ul class="contact">
        {{#if basics.phone}}<li>{{basics.phone}}</li>{{/if}}
        {{#if basics.email}}<li>{{basics.email}}</li>{{/if}}
        {{#if basics.city}}<li>{{basics.city}}</li>{{/if}}
      </ul>
    </div>
    {{#if skills}}
    <div class="block">
      <h3>专业技能</h3>
      <p class="tags">{{#each skills}}<span class="tag">{{this}}</span>{{/each}}</p>
    </div>
    {{/if}}
    {{#if basics.links}}
    <div class="block">
      <h3>个人链接</h3>
      <ul class="contact">
        {{#each basics.links}}<li class="link">{{this}}</li>{{/each}}
      </ul>
    </div>
    {{/if}}
  </aside>
  <main class="main">
    {{#if summary}}
    <section>
      <h2>自我评价</h2>
      <p class="summary">{{summary}}</p>
    </section>
    {{/if}}
    {{#if experience}}
    <section>
      <h2>工作经历</h2>
      {{#each experience}}
      <div class="item">
        <div class="row"><span class="strong">{{company}}</span><span class="date">{{start}} - {{end}}</span></div>
        {{#if role}}<div class="role">{{role}}</div>{{/if}}
        {{#if bullets}}
        <ul>{{#each bullets}}<li>{{this}}</li>{{/each}}</ul>
        {{/if}}
      </div>
      {{/each}}
    </section>
    {{/if}}
    {{#if projects}}
    <section>
      <h2>项目经历</h2>
      {{#each projects}}
      <div class="item">
        <div class="row"><span class="strong">{{name}}</span>{{#if role}}<span class="role">{{role}}</span>{{/if}}</div>
        {{#if desc}}<p class="desc">{{desc}}</p>{{/if}}
        {{#if bullets}}
        <ul>{{#each bullets}}<li>{{this}}</li>{{/each}}</ul>
        {{/if}}
      </div>
      {{/each}}
    </section>
    {{/if}}
    {{#if education}}
    <section>
      <h2>教育背景</h2>
      {{#each education}}
      <div class="item">
        <div class="row"><span class="strong">{{school}}</span><span class="date">{{start}} - {{end}}</span></div>
        <div class="role">{{major}}{{#if degree}} · {{degree}}{{/if}}</div>
        {{#if extra}}<div class="role pre">{{extra}}</div>{{/if}}
      </div>
      {{/each}}
    </section>
    {{/if}}
  </main>
</div>`,
};
