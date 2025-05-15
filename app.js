// MQTT连接配置
const client = new Paho.MQTT.Client('8.134.109.4', 1883, 'web_client_' + Math.random().toString(16).substr(2, 8));

// 图表初始化
const ctx = document.getElementById('waveformChart').getContext('2d');
const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: '实时波形',
      data: [],
      borderColor: 'rgb(75, 192, 192)',
      tension: 0.1
    }]
  },
  options: {
    scales: {
      x: { display: true, title: { display: true, text: '时间序列' } },
      y: { display: true, title: { display: true, text: '测量值' } }
    }
  }
});

// MQTT连接回调
// 在MQTT连接逻辑后添加状态监听
client.onConnectionLost = (response) => {
  alert(`连接中断: ${response.errorMessage}`);
  updateConnectionStatus(false);
};

client.onConnect = () => {
  updateConnectionStatus(true);
};

// 初始化连接状态检测
function updateConnectionStatus(isConnected) {
    const statusElem = document.getElementById('connectionStatus');
    const statusIcon = statusElem.querySelector('.status-icon');
    const statusText = statusElem.querySelector('.status-text');
    
    statusElem.className = `status-indicator ${isConnected ? 'connected' : 'disconnected'}`;
    statusText.textContent = isConnected ? '已连接' : '未连接';
  }

// 页面加载时初始状态
updateConnectionStatus(false);

client.onMessageArrived = (message) => {
  if(message.destinationName === 'hetai') {
    const payload = message.payloadString;
    const value = parseFloat(payload);
    
    // 更新实时图表
    const timestamp = new Date().toLocaleTimeString();
    chart.data.labels.push(timestamp);
    chart.data.datasets[0].data.push(value);
    
    if(chart.data.labels.length > 50) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update();
    
    // 存储历史记录
    const historyItem = {
      time: timestamp,
      value: value,
      advice: generateAdvice(value)
    };
    localStorage.setItem(Date.now(), JSON.stringify(historyItem));
  }
};

// 初始化连接
client.connect({
  onSuccess: () => {
    console.log('MQTT连接成功');
    client.subscribe('hetai');
  },
  onFailure: (err) => {
    console.error('连接失败:', err.errorMessage);
  }
});

// 智能建议生成规则
function generateAdvice(value) {
  const rules = {
    high: { threshold: 100, message: '数值过高，请检查传感器' },
    low: { threshold: 0, message: '数值过低，建议校准设备' }
  };

  if(value > rules.high.threshold) return rules.high.message;
  if(value < rules.low.threshold) return rules.low.message;
  return '数值正常范围内';
}

// 选项卡切换功能
function openTab(evt, tabName) {
  const tabContents = document.getElementsByClassName('tabcontent');
  const tabLinks = document.getElementsByClassName('tablinks');

  Array.from(tabContents).forEach(content => {
    content.style.display = 'none';
  });

  Array.from(tabLinks).forEach(link => {
    link.className = link.className.replace(' active', '');
  });

  document.getElementById(tabName).style.display = 'block';
  evt.currentTarget.className += ' active';

  // 更新历史记录和智能建议显示
  if(tabName === 'history') updateHistoryList();
  if(tabName === 'advice') updateAdviceDisplay();
}

// 初始化默认打开实时选项卡
document.getElementById('defaultOpen').click();

// 历史记录更新函数
function updateHistoryList() {
  const historyDiv = document.getElementById('historyList');
  historyDiv.innerHTML = Object.keys(localStorage)
    .sort((a,b) => b - a)
    .map(key => {
      const item = JSON.parse(localStorage.getItem(key));
      return `<div>${item.time} - 数值: ${item.value} (建议: ${item.advice})</div>`;
    })
    .join('');
}

// 智能建议更新函数
function updateAdviceDisplay() {
  const adviceDiv = document.getElementById('adviceContent');
  const latestItem = JSON.parse(localStorage.getItem(Math.max(...Object.keys(localStorage))));
  adviceDiv.innerHTML = latestItem 
    ? `<h3>最新建议：</h3><p>${latestItem.advice}</p>` 
    : '<p>暂无建议</p>';
}