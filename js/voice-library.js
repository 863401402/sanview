(function (root, factory) {
  var library = factory();
  if (typeof module === 'object' && module.exports) module.exports = library;
  root.SanviewVoiceLibrary = library;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function variants(key, texts) {
    return texts.map(function (text, index) {
      return { text: text, path: 'assets/audio/' + key + '-' + (index + 1) + '.mp3' };
    });
  }

  return {
    view_front: variants('view-front', [
      '从前面看，这就是正视图，像给积木拍了一张正面照。',
      '现在是正视图。眯起眼睛看看，它的轮廓是什么样？'
    ]),
    view_left: variants('view-left', [
      '从左面看，这就是左视图，积木换了一个模样。',
      '现在是左视图。注意前后方向，别让它们偷偷换位置。'
    ]),
    view_top: variants('view-top', [
      '从上面看，这就是俯视图，像小鸟飞到积木上空。',
      '现在是俯视图。看看每一列积木藏在哪个位置。'
    ]),
    observe_new: variants('observe-new', [
      '新的积木结构出现了。转一转，看看它的三个投影。',
      '换了一组积木。来当空间观察员，找找三个方向有什么不同。'
    ]),
    draw_new: variants('draw-new', [
      '新题准备好了。先给积木转一圈，再画出它的三张照片。',
      '空间小侦探出发。观察立体结构，完成右边的三个视图。'
    ]),
    draw_success: variants('draw-success', [
      '三幅视图都画对了，空间观察员任务完成。',
      '全部正确。你的空间眼睛越来越厉害了。',
      '检查完成，正视图、左视图和俯视图全部点亮。'
    ]),
    draw_retry_front: variants('draw-retry-front', [
      '正视图藏着一个小线索，再看看前面的形状。',
      '先检查正视图。数一数从前面看，每一行应该有几个格子。'
    ]),
    draw_retry_left: variants('draw-retry-left', [
      '左视图还有一点不一样，再看看左面的形状。',
      '先检查左视图。注意从左面看时，前后方向的位置。'
    ]),
    draw_retry_top: variants('draw-retry-top', [
      '俯视图里藏着一个小线索，再从上面看一遍。',
      '先检查俯视图。想一想哪些位置上放着积木。'
    ]),
    answer_reveal: variants('answer-reveal', [
      '正确答案已经出现。像找不同一样，看看哪里不一样。',
      '答案揭晓。比较每一行和每一列，找出刚才漏掉的线索。'
    ]),
    drawing_reset: variants('drawing-reset', [
      '画板擦干净了。慢慢观察，再试一次。',
      '格子已经清空，这次先拿下最容易看出的视图。'
    ]),
    challenge_new: variants('challenge-new', [
      '新挑战准备好了。根据右边的三张照片，把积木找回来。',
      '还原任务开始。三个投影全部一致，就是你的正确答案。'
    ]),
    challenge_success: variants('challenge-success', [
      '三幅视图全部匹配，积木还原成功。',
      '挑战完成。你搭出的结构通过了三个方向的检验。',
      '正视图、左视图和俯视图全部点亮，漂亮。'
    ]),
    challenge_retry: variants('challenge-retry', [
      '还有视图没有匹配。找到那个方向，再调整积木。',
      '还差一点。先找出没有点亮的视图，再修改对应位置。',
      '线索就在右边。从提示的视图开始，一格一格检查。'
    ]),
    build_cleared: variants('build-cleared', [
      '积木已经清空，可以重新搭建。',
      '搭建盘已经清空，需要时可以用撤销恢复。'
    ]),
    tool_add: variants('tool-add', [
      '现在使用增加工具。',
      '增加模式，轻点位置放入积木。'
    ]),
    tool_remove: variants('tool-remove', [
      '现在使用减少工具。',
      '减少模式，轻点位置拿走积木。'
    ]),
    sound_on: variants('sound-on', [
      '声音已经打开。',
      '语音提示已开启。'
    ]),
    tutorial_learn_1: variants('tutorial-learn-1', ['先选择观察难度。点击左右箭头，可以循环切换四个等级。']),
    tutorial_learn_2: variants('tutorial-learn-2', ['点击前、左、上，从三个方向给积木拍照。']),
    tutorial_learn_3: variants('tutorial-learn-3', ['右边是三幅投影。先看轮廓，再比较每一行和每一列。']),
    tutorial_draw_1: variants('tutorial-draw-1', ['画视图任务开始。观察左边的立体结构，在右边画出三幅投影。']),
    tutorial_draw_2: variants('tutorial-draw-2', ['点击格子进行涂色。三个视图完成后，点击检查。']),
    tutorial_draw_3: variants('tutorial-draw-3', ['这里可以换难度、出新题、看答案或者重画。']),
    tutorial_challenge_1: variants('tutorial-challenge-1', ['还原积木任务开始。根据右边的三个目标视图，在左边搭积木。']),
    tutorial_challenge_2: variants('tutorial-challenge-2', ['俯视搭建盘里的数字，表示这一列积木的高度。']),
    tutorial_challenge_3: variants('tutorial-challenge-3', ['每次搭建都会比较投影。三个视图全部匹配，就挑战成功。']),
    tutorial_build_1: variants('tutorial-build-1', ['自由搭建没有标准答案。点击底座或方块表面，创造自己的结构。']),
    tutorial_build_2: variants('tutorial-build-2', ['用俯视搭建盘，可以准确调整每一列的高度。']),
    tutorial_build_3: variants('tutorial-build-3', ['搭错了可以撤销，清空以后也能马上恢复。放心试一试。'])
  };
});
