// MQTT连接配置
const client = new Paho.MQTT.Client(
    '8.134.109.4',
    8083,  // 改用WebSocket端口
    '/mqtt',  // 路径参数（根据服务器配置可能需要添加）
    'web_client_' + Math.random().toString(16).substr(2, 8)
);

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
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            font: { size: 24 }
          }
        }
      },
      scales: {
        x: { 
          display: true, 
          title: { 
            display: true, 
            text: '时间序列',
            font: { size: 24 }
          },
          ticks: { font: { size: 24 }
          }
        },
        y: { 
          display: true, 
          title: { 
            display: true, 
            text: '测量值',
            font: { size: 24 }
          },
          ticks: {
            font: { size: 24 },
            callback: function(value) { return value.toFixed(2); }
          },
          beginAtZero: false
        }
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

// 在全局范围添加接收状态标志
let isReceivingData = false;

// 修改后的MQTT消息处理逻辑
client.onMessageArrived = (message) => {
  if(message.destinationName === 'hetai') {
    const payload = message.payloadString;
    
    // 空消息过滤
    if(!payload.trim()) return;
    
    // 处理控制命令
    if(payload === '8888') {
      console.log(`[${new Date().toLocaleTimeString()}] 开始接收波形数据指令`);
      isReceivingData = true;
      chart.data.labels = [];
      chart.data.datasets[0].data = [];
      chart.update();
      return;
    }
    if(payload === '7777') {
      console.log(`[${new Date().toLocaleTimeString()}] 保存波形数据指令，采样点数量：${chart.data.labels.length}`);
      updateHealthCard('healthy');
      // 新增波形数据保存逻辑
      const waveformData = {
        timestamp: new Date().toLocaleTimeString(),
        labels: [...chart.data.labels],
        values: [...chart.data.datasets[0].data]
      };
      localStorage.setItem(`waveform_${Date.now()}`, JSON.stringify(waveformData));
      
      
      
      isReceivingData = false;
      updateHistoryList();
      return;
    }
    
    // 在MQTT消息处理部分增加校验
    // 预处理数字字符串
    const processedPayload = payload
      .replace(/[^\d.\-\u4e00-\u9fa5]/g, '') // 移除非数字字符和中文
      .replace(/[一二两三四五六七八九零]/g, m => ({'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'零':0}[m]))
      .replace(/十/g, '*10+')
      .replace(/百/g, '*100+')
      .replace(/千/g, '*1000+')
      .replace(/万/g, '*10000+')
      .replace(/点/g, '.')
      .replace(/(\d)[^\d.]+/g, '$1');

    // 转换中文数字表达式
    let numericString = processedPayload
      .replace(/^[^\d.-]+/, '')
      .replace(/[^\d.-]$/, '');

    // 尝试解析处理后的字符串
    const value = parseFloat(
      numericString.includes('*') 
        ? eval(numericString.replace(/\+$/, '')) 
        : numericString
    );
    if(isNaN(value)) {
      console.error('无效数值:', payload);
      return;
    }
    
    // 只在接收状态时处理数据
    if(isReceivingData) {
      // 更新实时图表
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] 接收到有效数据: ${value.toFixed(2)}`);
      chart.data.labels.push(timestamp);
      chart.data.datasets[0].data.push(value);
      
      if(chart.data.labels.length > 1000) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
      }
      chart.update();
      

    }
  }
};

// 初始化连接
client.connect({
  onSuccess: () => {
    console.log('MQTT连接成功');
    client.subscribe('hetai');
    updateConnectionStatus(true); // 显式更新连接状态
  },
  onFailure: (err) => {
    console.error('连接失败:', err.errorMessage);
    updateConnectionStatus(false);
  }
});

// 健康状态管理
let healthStatus = 'healthy';



// 切换按钮事件
// 健康状态发送函数
function sendHealthStatus(status) {
  const message = new Paho.MQTT.Message(status.toString());
  message.destinationName = 'result';
  client.send(message);
  updateHealthCard(status === 1 ? 'healthy' : 'unhealthy');
}

// 更新健康卡片显示逻辑
function updateHealthCard(status) {
  const healthCard = document.getElementById('healthCard');
  healthCard.style.display = 'block';
  healthCard.classList[status === 'healthy' ? 'remove' : 'add']('abnormal');
  healthCard.querySelector('.health-text').textContent = 
    status === 'healthy' ? '当前状态：健康' : '当前状态：异常';
}

// 智能建议生成规则
function generateAdvice(value) {
  const rules = {
    high: { threshold: 100, message: '数值过高，请检查传感器' },
    low: { threshold: -50, message: '负值异常，检查信号线路' }
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
  if(tabName === 'result') updateResultDisplay();
}

// 初始化默认打开实时选项卡
document.getElementById('defaultOpen').click();

// 历史记录更新函数
function clearHistory() {
  if(confirm('确定要清空所有历史记录吗？此操作不可恢复！')) {
    localStorage.clear();
    updateHistoryList();
    alert('已清空全部历史记录');
  }
}

function updateHistoryList() {
  const historyDiv = document.getElementById('historyList');
  historyDiv.innerHTML = Object.keys(localStorage)
    .sort((a,b) => b - a)
    .map(key => {
      const item = JSON.parse(localStorage.getItem(key));
      
      if(key.startsWith('waveform_')) {
        // 添加缩略图canvas
        return `<div class="waveform-record" onclick="showWaveformDetail('${key}')">
                  <div class="waveform-thumbnail">
                    <canvas id="thumb_${key}"></canvas>
                  </div>
                  <div class="waveform-meta">
                    <span>${item.timestamp}</span>
                    <span>${item.labels.length}个采样点</span>
                  </div>
                </div>`;
      }
      
      })
    .join('');
    
  // 延迟渲染缩略图
  setTimeout(() => {
    Object.keys(localStorage).filter(k => k.startsWith('waveform_')).forEach(key => {
      const data = JSON.parse(localStorage.getItem(key));
      const canvas = document.getElementById(`thumb_${key}`);
      if(canvas) {
        new Chart(canvas.getContext('2d'), {
          type: 'line',
          data: {
            labels: data.labels,
            datasets: [{
              data: data.values,
              borderColor: '#ff7675',
              borderWidth: 2,
              pointRadius: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { display: false }, y: { display: false } }
          }
        });
      }
    });
  }, 100);
}

// 智能建议更新函数
function updateResultDisplay() {
  const resultDiv = document.getElementById('resultContent');
  resultDiv.innerHTML = '';
}


// 新增波形详情展示函数
function showWaveformDetail(key) {
  const data = JSON.parse(localStorage.getItem(key));
  
  // 清理旧图表实例
  if(window.historyChart) {
    window.historyChart.destroy();
  }
  
  // 创建图表容器
  const container = document.getElementById('historyChartContainer') || document.createElement('div');
  container.id = 'historyChartContainer';
  container.innerHTML = '<canvas id="historyChart"></canvas>';
  document.getElementById('history').appendChild(container);
  
  // 初始化历史图表
  const historyCtx = document.getElementById('historyChart').getContext('2d');
  window.historyChart = new Chart(historyCtx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [{
        label: '历史波形',
        data: data.values,
        borderColor: '#ff7675',
        tension: 0.1
      }]
    },
    options: {
      animation: {
        duration: 2000,
        easing: 'easeOutQuart'
      },
      scales: {
        x: {
          ticks: { font: { size: 14 } }
        },
        y: {
          ticks: {
            font: { size: 14 },
            callback: function(value) { return value.toFixed(2); }
          }
        }
      }
    }
  });
}